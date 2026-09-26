import "server-only";

// Trendyol sipariş arşivi (TrendyolOrder) — besleme ve bakım servisleri.
//
// Kaynak her zaman Trendyol API'sidir; arşiv onun kalıcı kopyasıdır. Sürekli
// polling/cron YOK (Vercel Hobby dakikalık cron'a izin vermiyor): arşiv, sayfa
// açılınca rate-gated "tazelik kontrolü", günlük gün sonu cron'u, kurye ekranı
// olayları ve elle "Geçmişi yükle" ile beslenir. Bkz. src/models/TrendyolOrder.ts

import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import TrendyolOrderModel, { PII_RETENTION_DAYS } from "@/models/TrendyolOrder";
import SettingModel from "@/models/Setting";
import {
  listTrendyolPackages,
  type TrendyolPackage,
} from "@/lib/integrations/trendyol/client";
import {
  mealCardInfo,
  paymentKey,
  sellerDiscount,
} from "@/lib/integrations/trendyol/packageUtils";
import {
  FINANCE_TYPES,
  TYPE_SIGN,
  fetchSettlementType,
} from "@/lib/integrations/trendyol/settlements";

const DAY_MS = 24 * 60 * 60 * 1000;
const META_KEY = "trendyolArchive";

// Tazelik eşikleri: paketler sık değişir (bugünün siparişleri), settlement
// kayıtları günde birkaç kez oluşur → daha seyrek.
const PACKAGE_MAX_AGE_MS = 10 * 60 * 1000;
// Bugünü gösteren listeler için daha sık tazelik (yeni sipariş kaçmasın).
export const LIVE_MAX_AGE_MS = 60 * 1000;
const SETTLEMENT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
// Settlement kaydı siparişten günler sonra (vade) oluşur → geriye bu kadar bakılır.
const SETTLEMENT_LOOKBACK_MS = 20 * DAY_MS;
// Tek senkronda paket penceresi en fazla bu kadar geriye gider (uzun boşlukta
// "Geçmişi yükle" kullanılır).
const MAX_CATCHUP_MS = 15 * DAY_MS;
// Trendyol son-değişiklik farkından türetilen teslim süresi bu aralıkta değilse
// güvenilmez sayılır (ör. sipariş sonradan düzeltildi) → süre yazılmaz.
const MIN_TY_DURATION_MIN = 5;
const MAX_TY_DURATION_MIN = 240;

export function trendyolConfigured(): boolean {
  return Boolean(
    process.env.TRENDYOL_SUPPLIER_ID &&
      (process.env.TRENDYOL_API_TOKEN ||
        (process.env.TRENDYOL_API_KEY && process.env.TRENDYOL_API_SECRET)),
  );
}

// ─── Meta (son senkron zamanları) ────────────────────────────────────────────
interface ArchiveMeta {
  lastSyncAt?: number;
  lastSettlementAt?: number;
  lastBackfillFrom?: number; // "Geçmişi yükle" ile inilen en eski gün başı
}

async function readMeta(): Promise<ArchiveMeta> {
  const doc = (await SettingModel.findOne({ key: META_KEY }).lean()) as {
    value?: ArchiveMeta;
  } | null;
  return doc?.value ?? {};
}

async function writeMeta(patch: Partial<ArchiveMeta>): Promise<void> {
  const set: Record<string, number> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "number") set[`value.${k}`] = v;
  }
  await SettingModel.updateOne({ key: META_KEY }, { $set: set }, { upsert: true });
}

// ─── Tek seferlik geçişler ───────────────────────────────────────────────────
// 1) Eski TrendyolCustomerSnapshot'ın 60 günlük TTL index'ini düşür — yoksa Mongo
//    arşivi silmeye devam eder. 2) Kısa süre kullanılan ayrı kurye teslim
//    koleksiyonunu arşive taşı. İkisi de idempotent; süreç başına bir kez denenir.
let migrated: Promise<void> | null = null;

async function migrateOnce(): Promise<void> {
  const coll = TrendyolOrderModel.collection;
  try {
    const indexes = await coll.indexes();
    for (const ix of indexes) {
      if (ix.expireAfterSeconds !== undefined && ix.name) {
        await coll.dropIndex(ix.name);
      }
    }
  } catch (err) {
    // Koleksiyon henüz yoksa index listesi hata verir — sorun değil.
    if (!(err instanceof Error && /ns does not exist|NamespaceNotFound/i.test(err.message))) {
      console.warn("[trendyol archive] TTL index düşürülemedi", err);
    }
  }

  try {
    const db = mongoose.connection.db;
    if (!db) return;
    const exists = await db.listCollections({ name: "trendyolcourierdeliveries" }).hasNext();
    if (!exists) return;
    const legacy = db.collection("trendyolcourierdeliveries");
    const docs = await legacy.find().toArray();
    for (const d of docs) {
      const res = await TrendyolOrderModel.updateOne(
        { packageId: String(d.packageId) },
        {
          $set: {
            courier: d.courier,
            deliveredAt: d.deliveredAt,
            deliveryDurationMin: d.deliveryDurationMin,
            deliveryTimeSource: "courier",
          },
        },
      );
      // Paket arşivde henüz yoksa (packageId senkronla gelecek) kaydı bırak.
      if (res.matchedCount > 0) await legacy.deleteOne({ _id: d._id });
    }
    if ((await legacy.countDocuments()) === 0) await legacy.drop();
  } catch (err) {
    console.warn("[trendyol archive] kurye teslim kayıtları taşınamadı", err);
  }
}

function ensureMigrated(): Promise<void> {
  migrated ??= migrateOnce().catch((err) => {
    migrated = null; // bir sonraki çağrıda tekrar dene
    console.warn("[trendyol archive] migrate", err);
  });
  return migrated;
}

// ─── Paket → arşiv kaydı ─────────────────────────────────────────────────────
function parseCoord(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

// Tek satır açık adres: "Cadde/sokak no · Bina 5, Kat 2, Daire 7 · Mahalle, İlçe
// — tarif". address1 genelde mahalleyi de içerir; içeriyorsa tekrar edilmez.
export function formatArchivedAddress(a: {
  street?: string | null;
  neighborhood?: string | null;
  district?: string | null;
  city?: string | null;
  apartmentNumber?: string | null;
  floor?: string | null;
  doorNumber?: string | null;
  addressDescription?: string | null;
}): string {
  const norm = (s?: string | null) =>
    (s ?? "").toLocaleLowerCase("tr").replace(/[^0-9a-zçğıöşü]/gi, "");
  const street = a.street?.trim() ?? "";
  const building = [
    a.apartmentNumber?.trim() ? `Bina ${a.apartmentNumber.trim()}` : null,
    a.floor?.trim() ? `Kat ${a.floor.trim()}` : null,
    a.doorNumber?.trim() ? `Daire ${a.doorNumber.trim()}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const nb = a.neighborhood?.trim();
  const area = [nb && !norm(street).includes(norm(nb)) ? nb : null, a.district?.trim()]
    .filter(Boolean)
    .join(", ");
  const desc = a.addressDescription?.trim();
  const descAdds = !!desc && norm(desc).length > 4 && !norm(street).includes(norm(desc));
  const head = [street || null, building || null, area || null].filter(Boolean).join(" · ");
  return [head || null, descAdds ? desc : null].filter(Boolean).join(" — ");
}

// Trendyol'dan gelen alanlar. Bizim yazdıklarımıza (kurye, teslim anı,
// settlement) DOKUNMAZ → senkron bunları ezmez.
function packageToArchive(p: TrendyolPackage, now: number): Record<string, unknown> {
  const name = [p.customer?.firstName, p.customer?.lastName].filter(Boolean).join(" ").trim();
  const created = p.packageCreationDate ? new Date(p.packageCreationDate) : undefined;
  const discount = sellerDiscount(p);
  const gross = p.totalPrice ?? 0;
  const card = mealCardInfo(p);

  // Telefon saklama süresini geçmiş (ör. "Geçmişi yükle" ile gelen) siparişte
  // telefon hiç yazılmaz. Adres/konum analiz için kalıcıdır.
  const piiExpired =
    created !== undefined && created.getTime() < now - PII_RETENTION_DAYS * DAY_MS;

  const doc: Record<string, unknown> = {
    orderNumber: p.orderNumber,
    packageId: p.id,
    storeId: p.storeId,
    deliveryType: p.deliveryType,
    packageStatus: p.packageStatus ?? "",
    customerId: p.customer?.id,
    customerName: name,
    city: p.address?.city ?? "",
    district: p.address?.district ?? "",
    neighborhood: p.address?.neighborhood ?? "",
    lines: (p.lines ?? []).map((l) => ({
      productId: l.productId,
      name: l.name,
      quantity: l.items?.length || 1,
      unitSellingPrice: l.unitSellingPrice ?? l.price ?? 0,
    })),
    totalPrice: gross,
    sellerDiscount: discount,
    netTotal: Math.max(gross - discount, 0),
    paymentKey: paymentKey(p),
    mealCardBrand: card?.brand,
    packageCreationDate: created,
    packageModificationDate: p.packageModificationDate
      ? new Date(p.packageModificationDate)
      : undefined,
    preparationTime: p.preparationTime ?? 0,
    lastSeenAt: new Date(now),
  };

  // Açık adres: address1 (+address2) cadde/sokak/no'yu taşır; kat/daire ayrı gelir.
  const a = p.address ?? {};
  const street = [a.address1, a.address2].map((s) => s?.trim()).filter(Boolean).join(" ");
  doc.street = street;
  doc.floor = a.floor?.trim() ?? "";
  doc.doorNumber = a.doorNumber?.trim() ?? "";
  doc.apartmentNumber = a.apartmentNumber?.trim() ?? "";
  doc.addressDescription = a.addressDescription ?? "";
  doc.addressFull = formatArchivedAddress({
    street,
    neighborhood: a.neighborhood,
    district: a.district,
    city: a.city,
    apartmentNumber: a.apartmentNumber,
    floor: a.floor,
    doorNumber: a.doorNumber,
    addressDescription: a.addressDescription,
  });
  doc.lat = parseCoord(p.address?.latitude);
  doc.lng = parseCoord(p.address?.longitude);
  if (piiExpired) {
    doc.phone = "";
    doc.piiPurgedAt = new Date(now);
  } else {
    doc.phone = p.address?.phone ?? p.callCenterPhone ?? "";
  }

  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
  return doc;
}

const PII_FIELDS = [
  "customerName",
  "phone",
  "street",
  "floor",
  "doorNumber",
  "apartmentNumber",
  "addressDescription",
  "addressFull",
  "lat",
  "lng",
  "customerId",
];

// Paketleri arşive yazar (upsert). Teslim edilmiş paketlerde, bizim kurye teslim
// anı yoksa Trendyol'un son değişiklik anı teslim anı sayılır (GO paketleri dahil).
export async function upsertTrendyolPackages(packages: TrendyolPackage[]): Promise<number> {
  if (packages.length === 0) return 0;
  await connectDB();
  await ensureMigrated();
  const now = Date.now();

  // KVKK ile anonimleştirilmiş siparişlere kişisel veri geri yazılmasın.
  const anonymized = new Set(
    (
      await TrendyolOrderModel.find({
        orderNumber: { $in: packages.map((p) => p.orderNumber) },
        anonymizedAt: { $exists: true },
      })
        .select({ orderNumber: 1 })
        .lean()
    ).map((d) => d.orderNumber),
  );

  const ops = packages.map((p) => {
    const set = packageToArchive(p, now);
    if (anonymized.has(p.orderNumber)) for (const f of PII_FIELDS) delete set[f];
    return {
      updateOne: {
        filter: { orderNumber: p.orderNumber },
        update: { $set: set },
        upsert: true,
      },
    };
  });
  await TrendyolOrderModel.bulkWrite(
    ops as Parameters<typeof TrendyolOrderModel.bulkWrite>[0],
    { ordered: false },
  );

  // Teslim anı: yalnız henüz yazılmamışsa (kurye ekranındaki gerçek an öncelikli).
  const deliveredOps = packages
    .filter((p) => p.packageStatus === "Delivered" && p.packageModificationDate)
    .map((p) => {
      const mins = Math.round((p.packageModificationDate - p.packageCreationDate) / 60000);
      const set: Record<string, unknown> = {
        deliveredAt: new Date(p.packageModificationDate),
        deliveryTimeSource: "trendyol",
      };
      if (mins >= MIN_TY_DURATION_MIN && mins <= MAX_TY_DURATION_MIN) {
        set.deliveryDurationMin = mins;
      }
      return {
        updateOne: {
          filter: { orderNumber: p.orderNumber, deliveredAt: { $exists: false } },
          update: { $set: set },
        },
      };
    });
  if (deliveredOps.length > 0) {
    await TrendyolOrderModel.bulkWrite(
      deliveredOps as Parameters<typeof TrendyolOrderModel.bulkWrite>[0],
      { ordered: false },
    );
  }
  return packages.length;
}

// packageModificationDate aralığındaki tüm paketler (sayfalı).
async function fetchPackagesRange(start: number, end: number): Promise<TrendyolPackage[]> {
  const size = 50;
  const first = await listTrendyolPackages({
    modificationStartDate: start,
    modificationEndDate: end,
    page: 0,
    size,
  });
  if (!first.ok) throw new Error(`Trendyol API: ${first.status} ${first.error}`);

  const totalPages = Math.min(first.data.totalPages ?? 1, 200);
  const all: TrendyolPackage[] = [...(first.data.content ?? [])];
  const BATCH = 5;
  for (let pageStart = 1; pageStart < totalPages; pageStart += BATCH) {
    const pages = Array.from(
      { length: Math.min(BATCH, totalPages - pageStart) },
      (_, i) => pageStart + i,
    );
    const results = await Promise.all(
      pages.map((page) =>
        listTrendyolPackages({
          modificationStartDate: start,
          modificationEndDate: end,
          page,
          size,
        }),
      ),
    );
    for (const r of results) {
      if (!r.ok) throw new Error(`Trendyol API: ${r.status} ${r.error}`);
      all.push(...(r.data.content ?? []));
    }
  }
  return all;
}

export async function syncTrendyolPackagesRange(start: number, end: number): Promise<number> {
  const packages = await fetchPackagesRange(start, end);
  return upsertTrendyolPackages(packages);
}

// ─── Settlement → sipariş bazlı hakediş ──────────────────────────────────────
// Her settlement kaydı id'siyle siparişin settlementLines map'ine yazılır
// (idempotent: aynı kayıt tekrar gelirse üzerine yazar, iki kez sayılmaz).
// Sonra dokunulan siparişlerde netRevenue/commissionAmount yeniden toplanır.
export async function attachTrendyolSettlements(start: number, end: number): Promise<number> {
  await connectDB();
  await ensureMigrated();
  const results = await Promise.all(
    FINANCE_TYPES.map((t) => fetchSettlementType(t, start, end)),
  );

  const ops: Array<Record<string, unknown>> = [];
  const touched = new Set<string>();
  results.forEach((res, i) => {
    if (!res.ok) {
      console.warn("[trendyol archive] settlement", res.error);
      return;
    }
    const type = FINANCE_TYPES[i];
    const sign = TYPE_SIGN[type];
    for (const item of res.items) {
      if (!item.orderNumber || !item.id) continue;
      const key = String(item.id).replace(/[.$]/g, "_");
      touched.add(item.orderNumber);
      ops.push({
        updateOne: {
          filter: { orderNumber: item.orderNumber },
          update: {
            $set: {
              [`settlementLines.${key}`]: {
                type,
                seller: (item.sellerRevenue ?? 0) * sign,
                // Komisyon maliyeti: satışta +, indirim/iadede iade edilen komisyon −.
                commission: Math.abs(item.commissionAmount ?? 0) * sign,
                at: new Date(item.transactionDate),
              },
            },
          },
        },
      });
    }
  });
  if (ops.length === 0) return 0;

  await TrendyolOrderModel.bulkWrite(
    ops as Parameters<typeof TrendyolOrderModel.bulkWrite>[0],
    { ordered: false },
  );
  await TrendyolOrderModel.updateMany({ orderNumber: { $in: [...touched] } }, [
    {
      $set: {
        netRevenue: {
          $round: [
            { $sum: { $map: { input: { $objectToArray: "$settlementLines" }, as: "l", in: "$$l.v.seller" } } },
            2,
          ],
        },
        commissionAmount: {
          $round: [
            { $sum: { $map: { input: { $objectToArray: "$settlementLines" }, as: "l", in: "$$l.v.commission" } } },
            2,
          ],
        },
      },
    },
  ], { updatePipeline: true }); // Mongoose 9: pipeline güncellemesi açıkça izinli olmalı
  return touched.size;
}

// ─── KVKK ────────────────────────────────────────────────────────────────────
// Saklama süresini aşan siparişlerde yalnız telefon silinir. Ad, adres, konum ve
// müşteri id'si satış/bölge analizi için kalıcıdır (işletme içi kullanım).
export async function purgeExpiredTrendyolPii(): Promise<number> {
  await connectDB();
  const cutoff = new Date(Date.now() - PII_RETENTION_DAYS * DAY_MS);
  const res = await TrendyolOrderModel.updateMany(
    { packageCreationDate: { $lt: cutoff }, piiPurgedAt: { $exists: false } },
    { $set: { phone: "", piiPurgedAt: new Date() } },
  );
  return res.modifiedCount ?? 0;
}

// Silme talebi: siparişlerdeki tüm kişisel alanlar temizlenir, sipariş (tutar,
// ürün, bölge) istatistik için anonim kalır. Sonraki senkronlar geri yazmaz.
export async function anonymizeTrendyolOrders(orderNumbers: string[]): Promise<number> {
  if (orderNumbers.length === 0) return 0;
  await connectDB();
  const now = new Date();
  const res = await TrendyolOrderModel.updateMany(
    { orderNumber: { $in: orderNumbers } },
    {
      $set: {
        customerName: "",
        phone: "",
        street: "",
        floor: "",
        doorNumber: "",
        apartmentNumber: "",
        addressDescription: "",
        addressFull: "",
        piiPurgedAt: now,
        anonymizedAt: now,
      },
      $unset: { lat: "", lng: "", customerId: "" },
    },
  );
  return res.modifiedCount ?? 0;
}

// ─── Kurye ekranı olayları ───────────────────────────────────────────────────
// Kurye ataması (üstlenme / yola çıkış / depodan düşme): paketi kimin taşıdığı.
// Kurye ekranından "Teslim" ile kesinleşmiş kayıt (deliveryTimeSource=courier)
// EZİLMEZ — teslim eden kişi son sözdür.
export async function assignTrendyolCourier(packageIds: string[], courier: string): Promise<void> {
  const name = courier.trim();
  if (!name || packageIds.length === 0) return;
  await connectDB();
  await TrendyolOrderModel.updateMany(
    { packageId: { $in: packageIds }, deliveryTimeSource: { $ne: "courier" } },
    { $set: { courier: name } },
  );
}

// Üstlenmeyi bırakma: yalnız aynı kurye yazılıysa ve paket henüz yola çıkmamış /
// teslim edilmemişse temizlenir.
export async function clearTrendyolCourier(packageId: string, courier: string): Promise<void> {
  await connectDB();
  await TrendyolOrderModel.updateOne(
    {
      packageId,
      courier: courier.trim(),
      shippedAt: { $exists: false },
      deliveryTimeSource: { $ne: "courier" },
    },
    { $unset: { courier: "" } },
  );
}

export async function recordTrendyolShipped(packageId: string, courier?: string): Promise<void> {
  await connectDB();
  await TrendyolOrderModel.updateOne(
    { packageId, shippedAt: { $exists: false } },
    { $set: { shippedAt: new Date(), packageStatus: "Shipped" } },
  );
  if (courier) await assignTrendyolCourier([packageId], courier);
}

// Teslim eden kurye + gerçek teslim anı. Trendyol'dan türetilmiş (tahmini) teslim
// anı varsa bunun üzerine yazar — kurye ekranındaki an daha doğrudur.
export async function recordTrendyolDelivered(
  packageId: string,
  courier: string | undefined,
): Promise<void> {
  await connectDB();
  const doc = await TrendyolOrderModel.findOne({ packageId })
    .select({ packageCreationDate: 1 })
    .lean();
  if (!doc) return;
  const now = new Date();
  const set: Record<string, unknown> = {
    deliveredAt: now,
    deliveryTimeSource: "courier",
    packageStatus: "Delivered",
  };
  if (courier) set.courier = courier;
  if (doc.packageCreationDate) {
    const mins = Math.round((now.getTime() - new Date(doc.packageCreationDate).getTime()) / 60000);
    if (mins > 0) set.deliveryDurationMin = mins;
  }
  await TrendyolOrderModel.updateOne({ packageId }, { $set: set });
}

// ─── Tazelik kontrolü ────────────────────────────────────────────────────────
// Rapor/sayfa okumadan önce çağrılır. Son senkrondan beri değişen paketleri
// (en az son 2 gün, en fazla 15 gün) ve periyodik olarak settlement'ı çeker.
// Hata okumayı engellemez; aynı süreçte eşzamanlı çağrılar tek senkrona bağlanır.
let inflight: Promise<void> | null = null;

export async function ensureTrendyolArchiveFresh(
  opts: { force?: boolean; maxAgeMs?: number } = {},
): Promise<void> {
  if (!trendyolConfigured()) return;
  // Süren senkron varsa: normal çağrı ona bağlanır; zorlama (gün sonu /
  // "Güncelle") onun bitmesini bekleyip kendi senkronunu yapar.
  if (inflight) {
    await inflight;
    if (!opts.force) return;
  }
  inflight ??= (async () => {
    try {
      await connectDB();
      await ensureMigrated();
      const meta = await readMeta();
      const now = Date.now();

      if (opts.force || !meta.lastSyncAt || now - meta.lastSyncAt > (opts.maxAgeMs ?? PACKAGE_MAX_AGE_MS)) {
        const from = meta.lastSyncAt ? meta.lastSyncAt - 60 * 60 * 1000 : now - 2 * DAY_MS;
        const start = Math.max(Math.min(from, now - 2 * DAY_MS), now - MAX_CATCHUP_MS);
        await syncTrendyolPackagesRange(start, now);
        await writeMeta({ lastSyncAt: now });
      }

      if (
        opts.force ||
        !meta.lastSettlementAt ||
        now - meta.lastSettlementAt > SETTLEMENT_MAX_AGE_MS
      ) {
        await attachTrendyolSettlements(now - SETTLEMENT_LOOKBACK_MS, now);
        await purgeExpiredTrendyolPii();
        await writeMeta({ lastSettlementAt: now });
      }
    } catch (err) {
      console.warn("[trendyol archive] tazelik senkronu başarısız", err);
    } finally {
      inflight = null;
    }
  })();
  await inflight;
}

// ─── Geçmişi yükle (parça parça) ─────────────────────────────────────────────
// UI tek tek çağırır: her çağrı [dayFrom, dayTo) aralığının paketlerini ve o
// siparişlerin settlement kayıtlarını çeker. Parça ≤15 gün (settlement sınırı).
export async function backfillTrendyolRange(start: number, end: number): Promise<{
  packages: number;
  settled: number;
}> {
  await connectDB();
  await ensureMigrated();
  const packages = await syncTrendyolPackagesRange(start, end);
  // Settlement vadesi siparişten sonra → pencereyi ileri uzat (bugünü aşmadan).
  const settled = await attachTrendyolSettlements(
    start,
    Math.min(end + SETTLEMENT_LOOKBACK_MS, Date.now()),
  );
  await purgeExpiredTrendyolPii();
  const meta = await readMeta();
  if (!meta.lastBackfillFrom || start < meta.lastBackfillFrom) {
    await writeMeta({ lastBackfillFrom: start });
  }
  return { packages, settled };
}

export async function getTrendyolArchiveMeta(): Promise<ArchiveMeta> {
  await connectDB();
  return readMeta();
}
