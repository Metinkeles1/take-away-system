"use server";

import { connectDB } from "@/lib/mongodb";
import TrendyolAutoJobModel from "@/models/TrendyolAutoJob";
import PrintAgentDeviceModel from "@/models/PrintAgentDevice";
import {
  ensurePrintAgentConfig,
  listPrintAgentDevices,
  patchPrintAgentConfig,
  readPrintAgentConfig,
} from "@/lib/printAgent/agent";
import { AGENT_ONLINE_MS, PREP_CHOICES } from "@/lib/printAgent/constants";

export type PrintAgentJobRow = {
  id: string;
  kind: "order" | "test" | "station";
  orderNumber: string | null;
  accountName: string | null;
  acceptOk: boolean | null;
  acceptError: string | null;
  printed: boolean;
  printedBy: string | null; // bilgisayar adı
  printError: string | null;
  at: string;
};

export type PrintAgentDeviceRow = {
  deviceId: string;
  host: string;
  online: boolean;
  lastSeenAt: string | null;
  printers: string[];
  printerName: string;
  print: boolean;
  testPending: boolean;
  uninstallPending: boolean;
};

export type PrintAgentStatus = {
  autoAccept: boolean;
  prepMinutes: number;
  installerAt: string | null; // kurulum dosyası en son indirilme anı
  devices: PrintAgentDeviceRow[];
  recent: PrintAgentJobRow[];
};

// Ayarlar kartı: genel ayarlar + kurulu bilgisayarlar + son işler.
export async function getPrintAgentStatus(): Promise<PrintAgentStatus> {
  await connectDB();
  const [cfg, devices, rows] = await Promise.all([
    readPrintAgentConfig(),
    listPrintAgentDevices(),
    TrendyolAutoJobModel.find().sort({ createdAt: -1 }).limit(8).lean(),
  ]);
  const hostOf = new Map(devices.map((d) => [d.deviceId, d.host || "Bilgisayar"]));
  const now = Date.now();
  return {
    autoAccept: cfg?.autoAccept ?? true,
    prepMinutes: cfg?.prepMinutes ?? 20,
    installerAt: cfg?.installerAt ?? null,
    devices: devices.map((d) => ({
      deviceId: d.deviceId,
      host: d.host,
      online: !!d.lastSeenAt && now - d.lastSeenAt.getTime() < AGENT_ONLINE_MS,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      printers: d.printers,
      printerName: d.printerName,
      print: d.print,
      testPending: !!d.testRequestedAt,
      uninstallPending: !!d.uninstallRequestedAt,
    })),
    recent: rows.map((r) => ({
      id: r.packageId,
      kind: (r.kind as PrintAgentJobRow["kind"]) ?? "order",
      orderNumber: r.orderNumber ?? null,
      accountName: r.accountName ?? null,
      acceptOk: typeof r.acceptOk === "boolean" ? r.acceptOk : null,
      acceptError: r.acceptError ?? null,
      printed: !!r.printedAt,
      printedBy: r.printedBy ? (hostOf.get(r.printedBy) ?? null) : null,
      printError: r.printError ?? null,
      at: (r.createdAt ?? new Date()).toISOString(),
    })),
  };
}

type Result = { ok: boolean; error?: string };

// Genel: otomatik kabul + hazırlık süresi (tüm bilgisayarlar için tek).
export async function updatePrintAgentSettings(patch: {
  autoAccept?: boolean;
  prepMinutes?: number;
}): Promise<Result> {
  try {
    await ensurePrintAgentConfig();
    const next: Parameters<typeof patchPrintAgentConfig>[0] = {};
    if (typeof patch.autoAccept === "boolean") {
      next.autoAccept = patch.autoAccept;
      // Yeni açıldıysa kapalıyken gelen siparişler topluca kabul edilmesin.
      if (patch.autoAccept) next.enabledAt = new Date().toISOString();
    }
    if (patch.prepMinutes !== undefined) {
      if (!(PREP_CHOICES as readonly number[]).includes(patch.prepMinutes)) {
        return { ok: false, error: "Geçersiz hazırlık süresi" };
      }
      next.prepMinutes = patch.prepMinutes;
    }
    await patchPrintAgentConfig(next);
    return { ok: true };
  } catch (err) {
    console.error("[updatePrintAgentSettings]", err);
    return { ok: false, error: "Ayar kaydedilemedi" };
  }
}

// Bilgisayar başına: fiş yazdırma, yazıcı.
export async function updatePrintAgentDevice(
  deviceId: string,
  patch: { print?: boolean; printerName?: string },
): Promise<Result> {
  try {
    await connectDB();
    const set: Record<string, unknown> = {};
    if (typeof patch.print === "boolean") set.print = patch.print;
    if (typeof patch.printerName === "string") set.printerName = patch.printerName.slice(0, 120);
    const r = await PrintAgentDeviceModel.updateOne({ deviceId }, { $set: set });
    return r.matchedCount ? { ok: true } : { ok: false, error: "Bilgisayar bulunamadı" };
  } catch (err) {
    console.error("[updatePrintAgentDevice]", err);
    return { ok: false, error: "Ayar kaydedilemedi" };
  }
}

// Bir sonraki yoklamada (≤20 sn) o bilgisayar deneme fişi basar.
export async function requestPrintAgentTest(deviceId: string): Promise<Result> {
  try {
    await connectDB();
    const r = await PrintAgentDeviceModel.updateOne({ deviceId }, { $set: { testRequestedAt: new Date() } });
    return r.matchedCount ? { ok: true } : { ok: false, error: "Bilgisayar bulunamadı" };
  } catch (err) {
    console.error("[requestPrintAgentTest]", err);
    return { ok: false, error: "İstek kaydedilemedi" };
  }
}

// Uzaktan kaldırma: bilgisayar açıksa ≤20 sn'de, kapalıysa ilk açılışta kendini
// kaldırır (açılıştan çıkar, durur) ve listeden düşer. cancel → vazgeç.
export async function requestPrintAgentUninstall(deviceId: string, cancel = false): Promise<Result> {
  try {
    await connectDB();
    const r = await PrintAgentDeviceModel.updateOne(
      { deviceId },
      cancel ? { $unset: { uninstallRequestedAt: 1 } } : { $set: { uninstallRequestedAt: new Date() } },
    );
    return r.matchedCount ? { ok: true } : { ok: false, error: "Bilgisayar bulunamadı" };
  } catch (err) {
    console.error("[requestPrintAgentUninstall]", err);
    return { ok: false, error: "İstek kaydedilemedi" };
  }
}

// Bilgisayar zaten elle kaldırıldıysa (Kaldir.bat) kayıt listede kalır → sil.
// Program yine çalışıyorsa bir sonraki yoklamada kendiliğinden geri eklenir.
export async function forgetPrintAgentDevice(deviceId: string): Promise<Result> {
  try {
    await connectDB();
    await PrintAgentDeviceModel.deleteOne({ deviceId });
    return { ok: true };
  } catch (err) {
    console.error("[forgetPrintAgentDevice]", err);
    return { ok: false, error: "Silinemedi" };
  }
}
