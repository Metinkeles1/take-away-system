"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import VoucherModel from "@/models/Voucher";
import EndOfDaySnapshotModel from "@/models/EndOfDaySnapshot";
import { type OrderSource } from "@/types";
import { istanbulDayStart, istanbulDateISO } from "@/lib/datetime";

// ─── Tipler ──────────────────────────────────────────────────────────────────
export type PaymentKey = "cash" | "card" | "online" | "meal_card" | "iban";

export interface EndOfDayBreakdownRow {
  key: string;
  count: number; // paket / sipariş adedi
  amount: number; // ciro (₺)
}

// Kurumsal müşteriye o gün giden hesap (voucher) kırılımı
export interface CorporateDayRow {
  id: string;
  name: string;
  count: number; // o gün kesilen fiş adedi
  amount: number; // toplam tutar (₺)
  openAmount: number; // henüz tahsil edilmemiş kısım (₺)
}

export interface EndOfDayReport {
  // Istanbul gününün ISO tarihi (YYYY-MM-DD) — fişte ve başlıkta gösterilir
  date: string;

  packageCount: number; // iptal hariç toplam paket
  totalRevenue: number; // iptal hariç toplam ciro
  cancelledCount: number;
  avgBasket: number;

  // Tahsilat durumu
  paidAmount: number; // ödenmiş ciro
  openAmount: number; // açık hesap (henüz tahsil edilmemiş)
  openCount: number;

  paymentBreakdown: EndOfDayBreakdownRow[]; // ödeme yöntemine göre (amount desc)
  sourceBreakdown: EndOfDayBreakdownRow[]; // kanala/ticket'a göre (count desc)
  statusBreakdown: Record<string, number>;

  // Kurumsal (açık hesap) — o gün kesilen fişler, kuruma göre
  corporateBreakdown: CorporateDayRow[];
  corporateTotal: number; // o gün kurumsallara giden toplam tutar
  corporateOpen: number; // bunun tahsil edilmemiş kısmı
  corporateVoucherCount: number; // toplam fiş adedi
}

// "YYYY-MM-DD" Istanbul gününün UTC başlangıç/bitiş sınırlarını döner.
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isoDateOf(dayStart: Date): string {
  const ist = new Date(dayStart.getTime() + ISTANBUL_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}-${pad2(ist.getUTCDate())}`;
}

// dateStr verilmezse "bugün" (Istanbul). Verilirse o günün sınırları.
function resolveDayRange(dateStr?: string): { start: Date; end: Date; iso: string } {
  let start: Date;
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    start = new Date(Date.UTC(y, m - 1, d) - ISTANBUL_OFFSET_MS);
  } else {
    start = istanbulDayStart();
  }
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end, iso: isoDateOf(start) };
}

const PAYMENT_KEYS: PaymentKey[] = ["cash", "card", "online", "meal_card", "iban"];
const SOURCE_KEYS: OrderSource[] = ["manual", "trendyol", "getir", "yemeksepeti"];

export async function getEndOfDayReport(dateStr?: string): Promise<EndOfDayReport> {
  await connectDB();

  const { start, end, iso } = resolveDayRange(dateStr);

  const [orders, vouchers] = await Promise.all([
    OrderModel.find({
      createdAt: { $gte: start, $lt: end },
    })
      .select({
        total: 1,
        status: 1,
        source: 1,
        paymentStatus: 1,
        "payment.method": 1,
      })
      .lean(),
    // Kurumsal fişler "date" (hizmet günü) alanına göre filtrelenir.
    VoucherModel.find({ date: { $gte: start, $lt: end } })
      .select({
        corporateId: 1,
        corporateName: 1,
        total: 1,
        paid: 1,
        paidAmount: 1,
      })
      .lean<
        Array<{
          corporateId: string;
          corporateName: string;
          total: number;
          paid?: boolean;
          paidAmount?: number;
        }>
      >(),
  ]);

  const paymentMap: Record<string, EndOfDayBreakdownRow> = {};
  for (const k of PAYMENT_KEYS) paymentMap[k] = { key: k, count: 0, amount: 0 };
  const sourceMap: Record<string, EndOfDayBreakdownRow> = {};
  for (const k of SOURCE_KEYS) sourceMap[k] = { key: k, count: 0, amount: 0 };

  const statusBreakdown: Record<string, number> = {};

  let packageCount = 0;
  let totalRevenue = 0;
  let cancelledCount = 0;
  let paidAmount = 0;
  let openAmount = 0;
  let openCount = 0;

  for (const o of orders) {
    const status = o.status as string;
    statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;

    if (status === "cancelled") {
      cancelledCount++;
      continue;
    }

    const total = o.total ?? 0;
    packageCount++;
    totalRevenue += total;

    // Ödeme yöntemi (eksik/bozuk kayıtları "cash"e değil ayrı tutmamak için atla)
    const method = o.payment?.method as PaymentKey | undefined;
    if (method && paymentMap[method]) {
      paymentMap[method].count++;
      paymentMap[method].amount += total;
    }

    // Kanal / ticket — eski kayıtlarda source olmayabilir → manual say
    const source = (o.source as OrderSource | undefined) ?? "manual";
    if (sourceMap[source]) {
      sourceMap[source].count++;
      sourceMap[source].amount += total;
    }

    // Tahsilat durumu
    if (o.paymentStatus === "open") {
      openAmount += total;
      openCount++;
    } else {
      paidAmount += total;
    }
  }

  // ─── Kurumsal fişler — kuruma göre grupla ───────────────────
  const corpMap = new Map<string, CorporateDayRow>();
  let corporateTotal = 0;
  let corporateOpen = 0;
  for (const v of vouchers) {
    const total = v.total ?? 0;
    const open = v.paid ? 0 : Math.max(0, total - (v.paidAmount ?? 0));
    corporateTotal += total;
    corporateOpen += open;

    const existing = corpMap.get(v.corporateId);
    if (existing) {
      existing.count++;
      existing.amount += total;
      existing.openAmount += open;
    } else {
      corpMap.set(v.corporateId, {
        id: v.corporateId,
        name: v.corporateName,
        count: 1,
        amount: total,
        openAmount: open,
      });
    }
  }
  const corporateBreakdown = [...corpMap.values()].sort((a, b) => b.amount - a.amount);

  const paymentBreakdown = Object.values(paymentMap)
    .filter((r) => r.count > 0)
    .sort((a, b) => b.amount - a.amount);

  const sourceBreakdown = Object.values(sourceMap)
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    date: iso,
    packageCount,
    totalRevenue,
    cancelledCount,
    avgBasket: packageCount > 0 ? totalRevenue / packageCount : 0,
    paidAmount,
    openAmount,
    openCount,
    paymentBreakdown,
    sourceBreakdown,
    statusBreakdown,
    corporateBreakdown,
    corporateTotal,
    corporateOpen,
    corporateVoucherCount: vouchers.length,
  };
}

// ─── Snapshot (dondurulmuş gün sonu) ───────────────────────────────────────────
// getEndOfDayReport ANLIK hesaplar; bu katman o özeti DB'ye sabitler ve okur.

export type SnapshotSource = "cron" | "manual";

export interface EndOfDayResult {
  report: EndOfDayReport;
  closed: boolean; // bu gün dondurulmuş bir snapshot'a sahip mi
  closedAt: string | null; // ISO timestamp
  source: SnapshotSource | null;
}

interface SnapshotLean {
  date: string;
  report: EndOfDayReport;
  closedAt?: Date;
  source?: SnapshotSource;
}

// O günün raporunu hesaplar ve EndOfDaySnapshot'a upsert eder (dondurur).
// Hem cron hem "Günü Kapat" butonu bunu çağırır → tek kaynak. İdempotent:
// kapalı gün tekrar çağrılırsa üzerine yazar.
export async function saveEndOfDaySnapshot(
  dateStr: string,
  source: SnapshotSource = "manual",
): Promise<EndOfDayReport> {
  await connectDB();
  const report = await getEndOfDayReport(dateStr);
  await EndOfDaySnapshotModel.findOneAndUpdate(
    { date: report.date },
    {
      $set: {
        report,
        totalRevenue: report.totalRevenue,
        packageCount: report.packageCount,
        closedAt: new Date(),
        source,
      },
    },
    { upsert: true },
  );
  return report;
}

// Dondurulmuş kaydı döndürür; yoksa null. (Dış API bunu kullanır.)
export async function getEndOfDaySnapshot(dateStr: string): Promise<EndOfDayResult | null> {
  await connectDB();
  const snap = await EndOfDaySnapshotModel.findOne({ date: dateStr }).lean<SnapshotLean>();
  if (!snap) return null;
  return {
    report: snap.report,
    closed: true,
    closedAt: snap.closedAt?.toISOString() ?? null,
    source: snap.source ?? null,
  };
}

// Sayfanın kullandığı okuma stratejisi:
//  - Geçmiş + kapatılmış gün → dondurulmuş snapshot (resmî, değişmez).
//  - Bugün / henüz kapatılmamış gün → canlı hesap (kapalıysa closed=true ile işaretlenir).
export async function getEndOfDay(dateStr?: string): Promise<EndOfDayResult> {
  await connectDB();
  const { iso } = resolveDayRange(dateStr);
  const today = istanbulDateISO();

  // Geçmiş gün: önce snapshot'a bak. Varsa dondurulmuş veriyi döndür ve canlı
  // hesaplamayı hiç çalıştırma (kapatılmış günlerin ucuz yolu). Sadece
  // snapshot'sız geçmiş günde canlı hesaba düşeriz.
  if (iso < today) {
    const snap = await EndOfDaySnapshotModel.findOne({ date: iso }).lean<SnapshotLean>();
    if (snap) {
      return {
        report: snap.report,
        closed: true,
        closedAt: snap.closedAt?.toISOString() ?? null,
        source: snap.source ?? null,
      };
    }
    return { report: await getEndOfDayReport(iso), closed: false, closedAt: null, source: null };
  }

  // Bugün / açık gün: snapshot durumu yalnızca "Kapatıldı" rozetini etkiler,
  // raporu her halükarda canlı hesaplıyoruz → iki sorguyu paralel çalıştır
  // (ardışık iki DB gidiş-dönüşü yerine tek tur, hot path'in gecikmesini düşürür).
  const [snap, report] = await Promise.all([
    EndOfDaySnapshotModel.findOne({ date: iso }).lean<SnapshotLean>(),
    getEndOfDayReport(iso),
  ]);
  return {
    report,
    closed: !!snap,
    closedAt: snap?.closedAt?.toISOString() ?? null,
    source: snap?.source ?? null,
  };
}
