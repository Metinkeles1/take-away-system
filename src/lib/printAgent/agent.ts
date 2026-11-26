import "server-only";

// "Trendyol Yazıcı" — kasa bilgisayarında çalışan küçük program (agents/
// trendyol-yazici/agent.ps1) ~20 sn'de bir /api/print-agent/poll'a sorar.
// Bütün iş burada, sunucuda yapılır:
//   • Tüm Trendyol hesaplarında yeni (Created) paketleri bulur,
//   • Ayar açıksa otomatik kabul eder (picked + hazırlık süresi),
//   • Fiş satırlarını kuyruğa koyar; fiş basan bilgisayarlardan YALNIZ BİRİ
//     alır (kilit), basınca "ack" ile düşer.
// Birden çok bilgisayar kurulabilir: her biri PrintAgentDevice kaydıdır
// (yazdırma/yazıcı/deneme/kaldırma bilgisayar başına). Otomatik kabul geneldir;
// kabul sunucuda ve paket başına kilitli olduğundan kaç bilgisayar olursa olsun
// sipariş bir kez kabul edilir.
// Trendyol API anahtarları bilgisayara hiç inmez; programda yalnızca bu
// kurulumun bağlantı anahtarı (token) vardır.

import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";
import TrendyolAutoJobModel from "@/models/TrendyolAutoJob";
import PrintAgentDeviceModel from "@/models/PrintAgentDevice";
import {
  acceptTrendyolPackage,
  listTrendyolPackages,
  type TrendyolPackage,
} from "@/lib/integrations/trendyol/client";
import { getTrendyolAccounts } from "@/lib/integrations/trendyol/accounts";
import { buildTestReceipt, buildTrendyolReceipt, type ReceiptLine } from "./receipt";
import { AGENT_ONLINE_MS } from "./constants";
import { queueTrendyolStations, readStationConfig, stationsActive } from "./stations";

const CONFIG_KEY = "printAgent";
const INTAKE_SLOT_KEY = "printAgentIntakeAt";

// Trendyol'a en sık bu aralıkla gidilir — kaç bilgisayar kaç kez sorarsa sorsun.
const INTAKE_MIN_MS = 12_000;
// Kabul denemesi kilidi (aynı anda iki istek aynı paketi kabul etmesin).
const ACCEPT_LOCK_MS = 30_000;
const MAX_ACCEPT_ATTEMPTS = 4;
// Fiş kilidi: alan bilgisayar bu sürede "bastım" demezse başkası alabilir.
const PRINT_LOCK_MS = 60_000;
const MAX_PRINT_ATTEMPTS = 5;
// Bundan eski bekleyen fiş basılmaz (yazdırma sonradan açılınca birikmiş fişler
// topluca çıkmasın).
const PRINT_MAX_AGE_MS = 10 * 60_000;
// İlk kurulumda / özellik yeni açılınca eski siparişler işlenmesin.
const INTAKE_LOOKBACK_MS = 45 * 60_000;

export interface PrintAgentConfig {
  token: string;
  autoAccept: boolean;
  prepMinutes: number;
  enabledAt: string; // ISO — bu andan önce gelen siparişler işlenmez
  installerAt?: string; // ISO — kurulum dosyası en son ne zaman indirildi
}

export interface PrintAgentDevice {
  deviceId: string;
  host: string;
  version: string;
  printers: string[];
  printerName: string;
  print: boolean;
  lastSeenAt: Date | null;
  testRequestedAt: Date | null;
  uninstallRequestedAt: Date | null;
}

const DEFAULTS = { autoAccept: true, prepMinutes: 20 };

export async function readPrintAgentConfig(): Promise<PrintAgentConfig | null> {
  await connectDB();
  const doc = await SettingModel.findOne({ key: CONFIG_KEY }).lean<{ value?: Partial<PrintAgentConfig> }>();
  const v = doc?.value;
  if (!v?.token) return null;
  return { ...DEFAULTS, enabledAt: new Date(0).toISOString(), ...v } as PrintAgentConfig;
}

export async function patchPrintAgentConfig(patch: Partial<PrintAgentConfig>): Promise<void> {
  await connectDB();
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) set[`value.${k}`] = v;
  await SettingModel.updateOne({ key: CONFIG_KEY }, { $set: set }, { upsert: true });
}

// İndirme / ilk ayar anında çağrılır: token yoksa üretir (bir kez), varsa aynısı.
export async function ensurePrintAgentConfig(): Promise<PrintAgentConfig> {
  const existing = await readPrintAgentConfig();
  if (existing) return existing;
  const fresh: PrintAgentConfig = {
    ...DEFAULTS,
    token: crypto.randomBytes(24).toString("hex"),
    enabledAt: new Date().toISOString(),
  };
  // Aynı anda iki indirme: yalnız ilki yazar, ikincisi ilkinin token'ını okur.
  await SettingModel.updateOne(
    { key: CONFIG_KEY, "value.token": { $exists: false } },
    { $set: { value: fresh } },
    { upsert: true },
  ).catch((err: { code?: number }) => {
    if (err.code !== 11000) throw err;
  });
  return (await readPrintAgentConfig()) ?? fresh;
}

export async function authPrintAgent(authHeader: string | null): Promise<PrintAgentConfig | null> {
  const provided = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!provided) return null;
  const cfg = await readPrintAgentConfig();
  if (!cfg) return null;
  const a = Buffer.from(provided);
  const b = Buffer.from(cfg.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? cfg : null;
}

// ─── Bilgisayarlar ───────────────────────────────────────────────────────────

export function isValidDeviceId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(id);
}

// Yoklamada bilgisayar kendini bildirir; ilk kez görülüyorsa kayıt açılır.
export async function touchDevice(
  deviceId: string,
  info: { host?: string; version?: string; printers?: string[] },
): Promise<PrintAgentDevice> {
  const set: Record<string, unknown> = { lastSeenAt: new Date() };
  if (info.host !== undefined) set.host = info.host;
  if (info.version !== undefined) set.version = info.version;
  if (info.printers !== undefined) set.printers = info.printers;
  const doc = await PrintAgentDeviceModel.findOneAndUpdate(
    { deviceId },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return toDevice(doc!);
}

function toDevice(d: Record<string, unknown>): PrintAgentDevice {
  return {
    deviceId: String(d.deviceId),
    host: (d.host as string) ?? "",
    version: (d.version as string) ?? "",
    printers: (d.printers as string[]) ?? [],
    printerName: (d.printerName as string) ?? "",
    print: d.print !== false,
    lastSeenAt: (d.lastSeenAt as Date) ?? null,
    testRequestedAt: (d.testRequestedAt as Date) ?? null,
    uninstallRequestedAt: (d.uninstallRequestedAt as Date) ?? null,
  };
}

export async function listPrintAgentDevices(): Promise<PrintAgentDevice[]> {
  await connectDB();
  const rows = await PrintAgentDeviceModel.find().sort({ createdAt: 1 }).lean();
  return rows.map((r) => toDevice(r as unknown as Record<string, unknown>));
}

export async function deleteDevice(deviceId: string): Promise<void> {
  await PrintAgentDeviceModel.deleteOne({ deviceId });
}

// Açık ve fiş basan bir bilgisayar var mı? Yoksa fiş kuyruğa hiç girmez.
async function anyPrintingDevice(): Promise<boolean> {
  const n = await PrintAgentDeviceModel.countDocuments({
    print: { $ne: false },
    uninstallRequestedAt: { $exists: false },
    lastSeenAt: { $gte: new Date(Date.now() - AGENT_ONLINE_MS) },
  });
  return n > 0;
}

// ─── Program dosyası ────────────────────────────────────────────────────────
// Program kendi dosyasının özetini (sha1) bununla karşılaştırır; farklıysa
// yenisini indirip kendini yeniden başlatır.
const SCRIPT_PATH = path.join(process.cwd(), "agents", "trendyol-yazici", "agent.ps1");

export async function readAgentScript(): Promise<{ bytes: Buffer; hash: string }> {
  const bytes = await fs.readFile(SCRIPT_PATH);
  return { bytes, hash: crypto.createHash("sha1").update(bytes).digest("hex") };
}

// ─── Yeni siparişleri işle ──────────────────────────────────────────────────

// Trendyol'a gitme sırası bizde mi? (autoSyncTrendyolCourierPackages ile aynı
// atomik desen: taze kayıt varsa upsert unique hatasına düşer = sıra değil.)
async function claimIntakeSlot(): Promise<boolean> {
  const now = new Date();
  try {
    const doc = await SettingModel.findOneAndUpdate(
      {
        key: INTAKE_SLOT_KEY,
        $or: [{ value: { $lt: new Date(now.getTime() - INTAKE_MIN_MS) } }, { value: { $exists: false } }],
      },
      { $set: { value: now } },
      { upsert: true, new: true },
    );
    return Boolean(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

function jobBase(p: TrendyolPackage, accountName: string) {
  return {
    kind: "order",
    orderNumber: String(p.orderNumber),
    accountName,
    supplierId: String(p.supplierId),
    packageCreatedAt: new Date(p.packageCreationDate),
  };
}

// Paketin kabulünü sahiplen. Kayıt yoksa oluşturur; varsa ancak kabul edilmemiş,
// deneme hakkı kalmış ve kilidi düşmüşse alır. Başkası tutuyorsa null.
async function claimAccept(p: TrendyolPackage, accountName: string) {
  const now = new Date();
  try {
    return await TrendyolAutoJobModel.findOneAndUpdate(
      {
        packageId: p.id,
        acceptOk: { $ne: true },
        acceptAttempts: { $lt: MAX_ACCEPT_ATTEMPTS },
        $or: [
          { acceptLockAt: { $exists: false } },
          { acceptLockAt: { $lt: new Date(now.getTime() - ACCEPT_LOCK_MS) } },
        ],
      },
      {
        $set: { acceptLockAt: now },
        $inc: { acceptAttempts: 1 },
        $setOnInsert: jobBase(p, accountName),
      },
      { upsert: true, new: true },
    ).lean();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null;
    throw err;
  }
}

// Fişi kuyruğa koy — yalnız bir kez (printQueuedAt zaten doluysa dokunmaz).
async function queuePrint(p: TrendyolPackage, accountName: string, receipt: ReceiptLine[]) {
  try {
    await TrendyolAutoJobModel.updateOne(
      { packageId: p.id, printQueuedAt: { $exists: false } },
      { $set: { printQueuedAt: new Date(), receipt }, $setOnInsert: jobBase(p, accountName) },
      { upsert: true },
    );
  } catch (err) {
    // Kayıt var ve zaten kuyrukta → unique hatası = beklenen durum.
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

export async function runIntake(cfg: PrintAgentConfig): Promise<{ accepted: number }> {
  const [print, stations] = await Promise.all([anyPrintingDevice(), readStationConfig()]);
  // İstasyon fişi kasa fişinden bağımsız: ocak bilgisayarında "fiş basar" kapalı olabilir.
  if (!cfg.autoAccept && !print && !stationsActive(stations)) return { accepted: 0 };
  if (!(await claimIntakeSlot())) return { accepted: 0 };

  const accounts = await getTrendyolAccounts();
  if (accounts.length === 0) return { accepted: 0 };
  const nameOf = new Map(accounts.map((a) => [a.supplierId, a.name]));

  // Picking da çekilir: otomatik kabul kapalıyken Trendyol ekranından kabul
  // edilen sipariş de basılabilsin.
  const res = await listTrendyolPackages({ packageStatuses: "Created,Picking", size: 50 });
  if (!res.ok) {
    console.warn("[print-agent intake]", res.status, res.error);
    return { accepted: 0 };
  }

  const since = Math.max(new Date(cfg.enabledAt).getTime(), Date.now() - INTAKE_LOOKBACK_MS);
  const fresh = res.data.content
    .filter((p) => p.packageCreationDate >= since)
    .sort((a, b) => a.packageCreationDate - b.packageCreationDate);

  let accepted = 0;
  for (const p of fresh) {
    const accountName = nameOf.get(String(p.supplierId)) ?? "Trendyol";

    if (p.packageStatus === "Created" && cfg.autoAccept) {
      const job = await claimAccept(p, accountName);
      if (!job) continue; // başkası kabul ediyor / zaten kabul edildi / hakkı bitti
      const r = await acceptTrendyolPackage(p.id, cfg.prepMinutes);
      if (r.ok) {
        accepted++;
        await TrendyolAutoJobModel.updateOne(
          { packageId: p.id },
          { $set: { acceptOk: true, acceptedAt: new Date() }, $unset: { acceptError: 1 } },
        );
        if (print) {
          await queuePrint(
            p,
            accountName,
            buildTrendyolReceipt(p, { accountName, accepted: true, prepMinutes: cfg.prepMinutes }),
          );
        }
        await queueTrendyolStations(stations, p, accountName);
      } else {
        const error = `${r.status} ${r.error}`.slice(0, 300);
        console.warn("[print-agent accept]", p.id, error);
        await TrendyolAutoJobModel.updateOne({ packageId: p.id }, { $set: { acceptOk: false, acceptError: error } });
        // Son deneme de başarısızsa fiş "elle kabul edin" uyarısıyla basılır.
        if (print && (job.acceptAttempts ?? 0) >= MAX_ACCEPT_ATTEMPTS) {
          await queuePrint(p, accountName, buildTrendyolReceipt(p, { accountName, accepted: false, acceptError: error }));
        }
      }
      continue;
    }

    // Otomatik kabul kapalı (ya da paket zaten kabul edilmiş): sadece yazdır.
    // Kabul edilmemiş (Created) paket istasyona gitmez — elle kabul edilince
    // Picking olur ve bir sonraki turda buradan düşer.
    if (print) {
      await queuePrint(
        p,
        accountName,
        buildTrendyolReceipt(p, { accountName, accepted: true, prepMinutes: p.preparationTime || undefined }),
      );
    }
    if (p.packageStatus !== "Created") await queueTrendyolStations(stations, p, accountName);
  }
  return { accepted };
}

// ─── Fiş kuyruğu ───────────────────────────────────────────────────────────

export interface PrintJob {
  id: string;
  lines: ReceiptLine[];
  printer?: string; // istasyon fişi: bu yazıcı (yoksa bilgisayarın yazıcısı)
}

// Bu bilgisayarın basacağı fişleri kilitleyerek alır. Deneme fişi yalnız ona;
// sipariş fişi, bu bilgisayarda yazdırma açıksa ve başka bilgisayar almadıysa.
export async function claimPrintJobs(device: PrintAgentDevice): Promise<PrintJob[]> {
  if (device.testRequestedAt) {
    const accounts = await getTrendyolAccounts().catch(() => []);
    await TrendyolAutoJobModel.updateOne(
      { packageId: `test-${device.deviceId}-${device.testRequestedAt.getTime()}` },
      {
        $setOnInsert: {
          kind: "test",
          accountName: device.host || "Deneme",
          targetDevice: device.deviceId,
          printQueuedAt: new Date(),
          receipt: buildTestReceipt(accounts.map((a) => a.name), device.printerName),
        },
      },
      { upsert: true },
    );
    await PrintAgentDeviceModel.updateOne({ deviceId: device.deviceId }, { $unset: { testRequestedAt: 1 } });
  }

  const now = Date.now();
  const target = device.print
    ? [{ targetDevice: device.deviceId }, { targetDevice: { $exists: false } }]
    : [{ targetDevice: device.deviceId }];
  const jobs: PrintJob[] = [];
  for (let i = 0; i < 10; i++) {
    const doc = await TrendyolAutoJobModel.findOneAndUpdate(
      {
        printQueuedAt: { $gte: new Date(now - PRINT_MAX_AGE_MS) },
        printedAt: { $exists: false },
        printAttempts: { $lt: MAX_PRINT_ATTEMPTS },
        $and: [
          { $or: target },
          {
            $or: [
              { printLockAt: { $exists: false } },
              { printLockAt: { $lt: new Date(now - PRINT_LOCK_MS) } },
              { printLockBy: device.deviceId }, // önceki "bastım" haberi ulaşmadıysa
            ],
          },
        ],
        packageId: { $nin: jobs.map((j) => j.id) },
      },
      { $set: { printLockAt: new Date(now), printLockBy: device.deviceId } },
      { sort: { printQueuedAt: 1 }, new: true, projection: { packageId: 1, receipt: 1, printerName: 1 } },
    ).lean<{ packageId: string; receipt?: ReceiptLine[]; printerName?: string }>();
    if (!doc) break;
    jobs.push({
      id: doc.packageId,
      lines: doc.receipt ?? [],
      ...(doc.printerName ? { printer: doc.printerName } : {}),
    });
  }
  return jobs;
}

export async function ackPrintJobs(
  deviceId: string,
  results: { id: string; ok: boolean; error?: string }[],
): Promise<void> {
  const now = new Date();
  await Promise.all(
    results.slice(0, 20).map((r) =>
      r.ok
        ? TrendyolAutoJobModel.updateOne(
            { packageId: r.id },
            { $set: { printedAt: now, printedBy: deviceId }, $unset: { printError: 1 } },
          )
        : // Basılamadı → kilidi bırak, sonraki turda (başka bilgisayar da) denesin.
          TrendyolAutoJobModel.updateOne(
            { packageId: r.id },
            {
              $inc: { printAttempts: 1 },
              $set: { printError: String(r.error ?? "bilinmeyen hata").slice(0, 300) },
              $unset: { printLockAt: 1, printLockBy: 1 },
            },
          ),
    ),
  );
}
