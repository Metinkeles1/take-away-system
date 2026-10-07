"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import VoucherModel from "@/models/Voucher";
import EndOfDaySnapshotModel from "@/models/EndOfDaySnapshot";
import { type OrderSource, type PaymentInfo } from "@/types";
import { isSplitPayment, paymentParts } from "@/lib/orders/paymentSplit";
import { istanbulDayStart, istanbulDateISO } from "@/lib/datetime";
import TrendyolOrderModel from "@/models/TrendyolOrder";
import {
  ensureTrendyolArchiveFresh,
  LIVE_MAX_AGE_MS,
  syncTrendyolPackagesRange,
  trendyolConfigured,
} from "@/lib/trendyol/archive";
import { archivedNet, normalizeMealCardBrand } from "@/lib/integrations/trendyol/packageUtils";
import { getDeliveryTargetMin } from "@/actions/settings";
import {
  getTrendyolDashboardStats,
  type TrendyolCategoryEarning,
} from "@/actions/trendyolDashboard";

// ─── Tipler ──────────────────────────────────────────────────────────────────
export type PaymentKey = "cash" | "card" | "online" | "meal_card" | "iban";

export interface EndOfDayBreakdownRow {
  key: string;
  count: number; // paket / sipariş adedi
  amount: number; // ciro (₺)
}

// Ödeme yöntemi defterinde "satıra tıkla → siparişler" için sipariş bazında
// satır. SADECE yerel (kendi) siparişler — Trendyol siparişleri yerel DB'de
// tutulmadığından sipariş bazında listelenemez (yalnız toplam tutar gösterilir).
export interface EndOfDayOrderRow {
  id: string; // order.id — /orders/:id detayına link
  orderNumber: number;
  customer: string;
  total: number;
  method: string; // ödeme yöntemi key'i (cash/card/online/meal_card/iban)
  time: string; // HH:MM (Istanbul) — sipariş alınış saati
  open: boolean; // açık hesap mı (tahsil edilmemiş)
  status: string;
}

// Kuryeye göre o günün teslimat kırılımı (yalnızca kurye atanmış yerel siparişler;
// Trendyol siparişlerinde kurye bilgisi yoktur).
export interface CourierDayRow {
  name: string;
  count: number; // taşıdığı paket adedi (iptal hariç)
  amount: number; // taşıdığı paketlerin toplam tutarı (₺)
  openAmount: number; // bunların tahsil edilmemiş (açık hesap) kısmı (₺)
}

// Kurumsal müşteriye o gün giden hesap (voucher) kırılımı
export interface CorporateDayRow {
  id: string;
  name: string;
  count: number; // o gün kesilen fiş adedi
  amount: number; // toplam tutar (₺)
  openAmount: number; // henüz tahsil edilmemiş kısım (₺)
}

// Trendyol o günün özeti — Trendyol API'sından (packages + settlements) okunur.
// Yerel DB'de Trendyol siparişi tutulmadığı için bu blok ayrı çekilip rapora
// birleştirilir; snapshot'a dondurulunca settlement rakamı da sabitlenir.
// Ödeme kanalına göre hakediş kırılımı — Trendyol "Para Akışı" mantığı.
//   trendyolNet = Tutar − Komisyon − İndirim (Trendyol "Satıcı Hakediş")
//   bankNet     = bankaya fiilen yatacak; yemek kartı/kod ile kalemlerde
//                 sağlayıcı %10'u da düşülmüş, kredi kartında = trendyolNet.
// Bankaya yatacak hesaba SADECE online kanallar girer: kredi kartı + yemek
// kartı. Kapıda ödeme (nakit/kart/kod) Trendyol'dan banka hesabına gelmez,
// para zaten kuryeyle kasaya girer → hakediş toplamına dahil edilmez.
export interface EndOfDayTrendyolEarnings {
  commissionRate: number; // online karttan türetilen efektif komisyon oranı
  creditCard: TrendyolCategoryEarning; // Kredi Kartı (online) — net GERÇEK
  ticket: TrendyolCategoryEarning; // Yemek Kartı — tahmini
  // Kapıda ödeme (nakit/kart/kod) — kendi kuryemizle fiziksel tahsil edilir.
  // trendyolNet = Trendyol komisyonu sonrası net (komisyon settlement'tan kesilir).
  onDelivery: TrendyolCategoryEarning;
  totalTrendyolNet: number; // kredi kartı + yemek kartı hakediş toplamı (₺) — online
  totalBankNet: number; // online bankaya yatacak net (kapıda HARİÇ) (₺)
}

// Trendyol gün sonu için temiz, okunabilir kategori dökümü satırı.
// group: "online" → para bankaya gelir; "onsite" → kapıda/kod ile elden tahsil.
// gross brüt satış (Trendyol paneliyle kıyaslanabilir); net toplamlar grup
// bazında earnings'ten gösterilir (satır başına net dağıtmaya gerek yok).
export interface EndOfDayTrendyolLine {
  label: string; // "Kredi Kartı", "Yemek Kartı · Multinet", "Nakit"...
  group: "online" | "onsite";
  count: number;
  gross: number;
}

export interface EndOfDayTrendyol {
  available: boolean; // API'dan başarıyla okundu mu
  error?: string; // okunamadıysa sebep
  orderCount: number; // iptal hariç sipariş adedi
  cancelledCount: number;
  revenue: number; // brüt ciro (₺)
  netRevenue: number; // online kart settlement neti — Net Hakediş'in GERÇEK kısmı (₺)
  avgBasket: number;
  // Hakediş kırılımı (kredi kartı / yemek kartı / kapıda) + bankaya yatacak.
  // Eski snapshot'larda olmayabilir → opsiyonel.
  earnings?: EndOfDayTrendyolEarnings | null;
  // Temiz kategori dökümü (Trendyol sekmesinde gösterilir). Eski snapshot'larda yok.
  lines?: EndOfDayTrendyolLine[];
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
  // Yöntem bazında YEREL kırılım (Trendyol HARİÇ) — kasa sayımı mutabakatı için.
  // paymentBreakdown'a Trendyol merge edildiği için ayrı tutulur.
  localPaymentBreakdown: EndOfDayBreakdownRow[];
  // Yöntem bazında YALNIZ Trendyol kırılımı — ödeme defterinde "Kendi vs Trendyol"
  // kolonlarını ayrı göstermek için. Trendyol okunamadıysa boş dizi.
  trendyolPaymentBreakdown: EndOfDayBreakdownRow[];
  // Yöntem bazında "satıra tıkla → siparişler" drill-down'ı için sipariş listesi
  // (yalnız yerel/kendi siparişler). Eski snapshot'larda olmayabilir → opsiyonel.
  orders: EndOfDayOrderRow[];
  sourceBreakdown: EndOfDayBreakdownRow[]; // kanala/ticket'a göre (count desc)
  statusBreakdown: Record<string, number>;

  // Kuryeye göre teslimat kırılımı (kurye atanmış yerel siparişler). Boşsa
  // kurye sistemi o gün kullanılmamış demektir → UI bölümü gizlenir.
  courierBreakdown: CourierDayRow[];

  // Kurumsal (açık hesap) — o gün kesilen fişler, kuruma göre
  corporateBreakdown: CorporateDayRow[];
  corporateTotal: number; // o gün kurumsallara giden toplam tutar
  corporateOpen: number; // bunun tahsil edilmemiş kısmı
  corporateVoucherCount: number; // toplam fiş adedi

  // Trendyol o günün özeti (rapora dahil edilmiştir). Okunamadıysa available=false.
  trendyol: EndOfDayTrendyol | null;
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

// Bir tarihi Istanbul saatine göre "HH:MM" formatında döner.
function istanbulHHMM(d: Date): string {
  const ist = new Date(d.getTime() + ISTANBUL_OFFSET_MS);
  return `${pad2(ist.getUTCHours())}:${pad2(ist.getUTCMinutes())}`;
}

// "YYYY-MM-DD" ISO gününe gün ekler/çıkarır (kıyas için "geçen aynı gün" = −7).
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
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

  // Trendyol'u o günün ortasını referans alarak çek (geçmiş gün → tüm gün,
  // bugün → şu ana kadar). Yerel DB sorgularıyla paralel koşar.
  const trendyolRefTs = start.getTime() + DAY_MS / 2;

  const [orders, vouchers, trendyol] = await Promise.all([
    OrderModel.find({
      createdAt: { $gte: start, $lt: end },
    })
      .select({
        id: 1,
        orderNumber: 1,
        "customer.name": 1,
        total: 1,
        status: 1,
        source: 1,
        paymentStatus: 1,
        "payment.method": 1,
        "payment.split": 1,
        courier: 1,
        createdAt: 1,
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
    // Trendyol API hatası rapora yansımasın — getTrendyolDashboardStats kendi
    // içinde yakalayıp error'lu boş istatistik döner; yine de güvence için sar.
    getTrendyolDashboardStats("today", trendyolRefTs).catch(() => null),
  ]);

  const paymentMap: Record<string, EndOfDayBreakdownRow> = {};
  for (const k of PAYMENT_KEYS) paymentMap[k] = { key: k, count: 0, amount: 0 };
  const sourceMap: Record<string, EndOfDayBreakdownRow> = {};
  for (const k of SOURCE_KEYS) sourceMap[k] = { key: k, count: 0, amount: 0 };

  const statusBreakdown: Record<string, number> = {};
  // Kuryeye göre teslimat kırılımı — iptal hariç, kurye atanmış siparişler.
  const courierMap = new Map<string, CourierDayRow>();
  // Sipariş bazında satırlar (drill-down) — iptal hariç yerel siparişler.
  const orderRows: EndOfDayOrderRow[] = [];

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
    // Bölünmüş ödeme (300 nakit + 100 kart) her yönteme kendi payı kadar yazılır;
    // sipariş her yöntemin adedinde bir kez sayılır.
    for (const part of paymentParts(o.payment as PaymentInfo | undefined, total)) {
      const row = paymentMap[part.method];
      if (!row) continue;
      row.count++;
      row.amount += part.amount;
    }

    // Kanal / ticket — eski kayıtlarda source olmayabilir → manual say
    const source = (o.source as OrderSource | undefined) ?? "manual";
    if (sourceMap[source]) {
      sourceMap[source].count++;
      sourceMap[source].amount += total;
    }

    // Tahsilat durumu
    const isOpen = o.paymentStatus === "open";
    if (isOpen) {
      openAmount += total;
      openCount++;
    } else {
      paidAmount += total;
    }

    // Drill-down satırı — yöntem bilinmiyorsa "other" altında toplanır.
    orderRows.push({
      id: (o as { id?: string }).id ?? "",
      orderNumber: (o as { orderNumber?: number }).orderNumber ?? 0,
      customer: (o as { customer?: { name?: string } }).customer?.name ?? "—",
      total,
      method: method ?? "other",
      time: istanbulHHMM((o as { createdAt?: Date }).createdAt ?? start),
      open: isOpen,
      status,
    });

    // Kurye kırılımı — yalnızca kurye atanmışsa.
    const courier = (o as { courier?: string }).courier;
    if (courier) {
      const row = courierMap.get(courier);
      if (row) {
        row.count++;
        row.amount += total;
        if (isOpen) row.openAmount += total;
      } else {
        courierMap.set(courier, {
          name: courier,
          count: 1,
          amount: total,
          openAmount: isOpen ? total : 0,
        });
      }
    }
  }

  const courierBreakdown = [...courierMap.values()].sort(
    (a, b) => b.count - a.count,
  );

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

  // Yöntem bazında YEREL kırılımı, Trendyol merge'inden ÖNCE dondur (kasa
  // sayımı mutabakatında "sistemde ne kadar X yöntemiyle satış var" için).
  const localPaymentBreakdown = Object.values(paymentMap)
    .filter((r) => r.count > 0)
    .map((r) => ({ key: r.key, count: r.count, amount: r.amount }))
    .sort((a, b) => b.amount - a.amount);

  // ─── Trendyol — o günün özetini rapora birleştir ───────────────
  // Yerel siparişlerde Trendyol yok; canlı API'dan gelen ciroyu toplam ciroya,
  // kanal kırılımına ("trendyol") ve ödeme kırılımına (online/meal_card/...) ekle.
  // Trendyol siparişleri online tahsil edilmiş sayılır → paidAmount'a yazılır.
  let trendyolSummary: EndOfDayTrendyol | null = null;
  // Yalnız Trendyol yöntem kırılımı (ödeme defterinde ayrı kolon). {key,count,amount}.
  let trendyolPaymentBreakdown: EndOfDayBreakdownRow[] = [];
  if (trendyol && !trendyol.error) {
    // Defteri kasaya/bankaya GEÇEN parayı göstermeli (ciro/brüt değil). Trendyol'un
    // sana fiilen geçen NET toplamı = online bankaya net + kapıda net. Tek satır,
    // "online" altında (Trendyol parası banka/elektronik üzerinden gelir). Yöntem
    // kırılımı Trendyol Hakediş kartında. earnings yoksa eski gross-by-method'a düşeriz.
    const e = trendyol.earnings;
    if (e) {
      const tyNet = e.totalBankNet + e.onDelivery.trendyolNet;
      trendyolPaymentBreakdown =
        tyNet > 0.5
          ? [{ key: "online", count: trendyol.orderCount, amount: tyNet }]
          : [];
    } else {
      trendyolPaymentBreakdown = trendyol.paymentBreakdown
        .map((p) => ({ key: p.key, count: p.count, amount: p.revenue }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.amount - a.amount);
    }
    // Temiz kategori dökümü (Trendyol sekmesi): online (bankaya) vs kapıda (elden/kod).
    // Yemek kartları marka bazında ayrı satır → kullanıcı "yemek kartı + kapıda"yı
    // net görür. pb.cash/pb.card SADECE kapıda (online kart "online" key'inde).
    const tLines: EndOfDayTrendyolLine[] = [];
    const te = trendyol.earnings;
    if (te) {
      if (te.creditCard.count > 0)
        tLines.push({
          label: "Kredi Kartı",
          group: "online",
          count: te.creditCard.count,
          gross: te.creditCard.gross,
        });
    }
    for (const m of trendyol.mealCardBreakdown) {
      if (m.count <= 0) continue;
      tLines.push({
        label: `Yemek Kartı · ${m.brand}${m.source === "on_delivery" ? " (kod)" : ""}`,
        group: m.source === "on_delivery" ? "onsite" : "online",
        count: m.count,
        gross: m.revenue,
      });
    }
    for (const p of trendyol.paymentBreakdown) {
      if (p.key === "cash" && p.count > 0)
        tLines.push({ label: "Nakit", group: "onsite", count: p.count, gross: p.revenue });
      if (p.key === "card" && p.count > 0)
        tLines.push({ label: "Kart", group: "onsite", count: p.count, gross: p.revenue });
    }

    trendyolSummary = {
      available: true,
      orderCount: trendyol.orderCount,
      cancelledCount: trendyol.cancelledCount,
      revenue: trendyol.revenue,
      netRevenue: trendyol.finance?.netRevenue ?? 0,
      avgBasket: trendyol.avgBasket,
      earnings: trendyol.earnings
        ? {
            commissionRate: trendyol.earnings.commissionRate,
            creditCard: trendyol.earnings.creditCard,
            ticket: trendyol.earnings.ticket,
            onDelivery: trendyol.earnings.onDelivery,
            totalTrendyolNet:
              trendyol.earnings.creditCard.trendyolNet +
              trendyol.earnings.ticket.trendyolNet,
            totalBankNet:
              trendyol.earnings.creditCard.bankNet + trendyol.earnings.ticket.bankNet,
          }
        : null,
      lines: tLines,
    };

    packageCount += trendyol.orderCount;
    totalRevenue += trendyol.revenue;
    cancelledCount += trendyol.cancelledCount;
    paidAmount += trendyol.revenue;

    if (sourceMap.trendyol) {
      sourceMap.trendyol.count += trendyol.orderCount;
      sourceMap.trendyol.amount += trendyol.revenue;
    }

    // Ödeme kırılımı — Trendyol key'leri proje ortak key'leriyle aynı
    // (cash/card/online/meal_card; bkz. trendyolDashboard.paymentKey).
    for (const p of trendyol.paymentBreakdown) {
      if (paymentMap[p.key]) {
        paymentMap[p.key].count += p.count;
        paymentMap[p.key].amount += p.revenue;
      }
    }
  } else if (trendyol) {
    trendyolSummary = {
      available: false,
      error: trendyol.error,
      orderCount: 0,
      cancelledCount: 0,
      revenue: 0,
      netRevenue: 0,
      avgBasket: 0,
    };
  }

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
    localPaymentBreakdown,
    trendyolPaymentBreakdown,
    orders: orderRows,
    sourceBreakdown,
    statusBreakdown,
    courierBreakdown,
    corporateBreakdown,
    corporateTotal,
    corporateOpen,
    corporateVoucherCount: vouchers.length,
    trendyol: trendyolSummary,
  };
}

// ─── Günün sipariş listesi (kendi + Trendyol) ───────────────────────────────────
// Gün sonu sayfasının "Siparişler" ve "Kuryeler" sekmeleri + grafikler bunu okur.
// Trendyol satırları kalıcı arşivden (TrendyolOrder) gelir: kurye, yemek kartı
// markası, teslim süresi ve sipariş bazlı hakediş orada. Parasal TOPLAMLAR yine
// rapordan (API) okunur — bu liste detay/kırılım içindir. Snapshot'a girmez:
// kapatılmış günde de canlı okunur (arşiv kalıcı olduğu için tutarlıdır).
export type DayOrderStatus = "active" | "delivered" | "cancelled";

// Sipariş satırı (ürün kazancı için). gross/net siparişin tutarından satırın
// payına göre dağıtılır: Trendyol'da komisyon ve satıcı indirimi de ürünlere
// aynı oranda yansır → "bu ürün Trendyol'da bana net ne bıraktı".
export interface EndOfDayOrderItem {
  name: string;
  qty: number;
  gross: number;
  net: number;
}

export interface EndOfDayOrder {
  key: string; // kanal + no — liste anahtarı
  id: string | null; // kendi sipariş id'si (/orders/:id); Trendyol'da null
  orderNumber: string;
  channel: "own" | "trendyol";
  customer: string;
  createdAt: number; // ms
  time: string; // HH:MM (Istanbul)
  total: number; // brüt (müşterinin ödediği)
  net: number | null; // Trendyol hakedişi; kendi siparişte null
  netEstimated: boolean; // settlement yok → tahmini hakediş
  method: PaymentKey | "other";
  mealCardBrand: string | null;
  // Bölünmüş ödeme parçaları (kendi sipariş, "300 nakit + 100 kart"); yoksa null.
  split: EndOfDaySplitPart[] | null;
  // Trendyol: para kapıda mı alındı (nakit/kart veya kodla yemek kartı).
  // false → online (bankaya). Kendi siparişte false.
  onDoor: boolean;
  courier: string | null;
  durationMin: number | null; // sipariş → teslim toplam süre
  status: DayOrderStatus;
  open: boolean; // açık hesap (tahsil edilmemiş)
  itemCount: number;
  items: EndOfDayOrderItem[];
  district: string | null;
}

export interface EndOfDaySplitPart {
  method: PaymentKey | "other";
  amount: number;
  mealCardBrand: string | null;
}

export interface EndOfDayOrders {
  orders: EndOfDayOrder[];
  deliveryTargetMin: number; // geç teslim eşiği (Ayarlar)
}

const OWN_STATUS: Record<string, DayOrderStatus> = {
  delivered: "delivered",
  cancelled: "cancelled",
};
const TY_STATUS: Record<string, DayOrderStatus> = {
  Delivered: "delivered",
  Cancelled: "cancelled",
  UnSupplied: "cancelled",
};
const TY_METHOD: Record<string, PaymentKey> = {
  online: "online",
  card: "card",
  cash: "cash",
  meal_card: "meal_card",
};

// Trendyol API'si ~1 ay geriye gider; daha eskisi yeniden çekilemez.
const TY_REFETCH_MAX_AGE_MS = 28 * DAY_MS;
// Teslim/iptal ertesi güne sarkabilir → değişiklik penceresini biraz uzat.
const TY_REFETCH_TAIL_MS = 12 * 60 * 60 * 1000;

type TyRow = {
  orderNumber: string;
  customerName?: string;
  neighborhood?: string;
  district?: string;
  lines?: { name?: string; quantity?: number; unitSellingPrice?: number }[];
  totalPrice?: number;
  netTotal?: number;
  netRevenue?: number | null;
  paymentKey?: string;
  mealCardBrand?: string;
  mealCardSource?: string;
  packageStatus?: string;
  packageCreationDate?: Date;
  courier?: string;
  deliveryDurationMin?: number;
};

function tyDayOrders(start: Date, end: Date): Promise<TyRow[]> {
  return TrendyolOrderModel.find({ packageCreationDate: { $gte: start, $lt: end } })
    .select({
      orderNumber: 1,
      customerName: 1,
      neighborhood: 1,
      district: 1,
      "lines.name": 1,
      "lines.quantity": 1,
      "lines.unitSellingPrice": 1,
      totalPrice: 1,
      netTotal: 1,
      netRevenue: 1,
      paymentKey: 1,
      mealCardBrand: 1,
      mealCardSource: 1,
      packageStatus: 1,
      packageCreationDate: 1,
      courier: 1,
      deliveryDurationMin: 1,
    })
    .lean<TyRow[]>();
}

// Satır tutarlarını siparişin brüt/net'ine oranla dağıt.
function spreadItems(
  lines: { name: string; qty: number; amount: number }[],
  gross: number,
  net: number,
): EndOfDayOrderItem[] {
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  return lines.map((l) => {
    const share = sum > 0 ? l.amount / sum : 1 / lines.length;
    return { name: l.name, qty: l.qty, gross: gross * share, net: net * share };
  });
}

export async function getEndOfDayOrders(dateStr?: string): Promise<EndOfDayOrders> {
  const { start, end, iso } = resolveDayRange(dateStr);
  // Bugün → arşivi en fazla 1 dk bayat tut (yeni sipariş kaçmasın). Trendyol
  // hatası listeyi düşürmesin: arşivde ne varsa onunla devam.
  if (iso === istanbulDateISO()) {
    await ensureTrendyolArchiveFresh({ maxAgeMs: LIVE_MAX_AGE_MS }).catch(() => {});
  }
  await connectDB();

  type OwnRow = {
    id: string;
    orderNumber: number;
    items?: { quantity?: number; totalPrice?: number; product?: { name?: string } }[];
    customer?: { name?: string; district?: string };
    payment?: PaymentInfo;
    status: string;
    total?: number;
    paymentStatus?: string;
    courier?: string;
    deliveryDurationMin?: number;
    createdAt: Date;
  };

  const [own, tyFirst, deliveryTargetMin] = await Promise.all([
    OrderModel.find({ createdAt: { $gte: start, $lt: end } })
      .select({
        id: 1,
        orderNumber: 1,
        "items.quantity": 1,
        "items.totalPrice": 1,
        "items.product.name": 1,
        "customer.name": 1,
        "customer.district": 1,
        "payment.method": 1,
        "payment.split": 1,
        "payment.mealCardBrand": 1,
        status: 1,
        total: 1,
        paymentStatus: 1,
        courier: 1,
        deliveryDurationMin: 1,
        createdAt: 1,
      })
      .lean<OwnRow[]>(),
    tyDayOrders(start, end),
    getDeliveryTargetMin(),
  ]);

  // Yemek kartının kaynağı (online / kapıda kod) arşive sonradan eklendi. O günün
  // kayıtlarında eksikse günü Trendyol'dan bir kez yeniden çek → alan dolar,
  // sonraki açılışlarda bu adım atlanır. Kurye/teslim alanlarına dokunmaz.
  let ty = tyFirst;
  const missingSource = ty.some((o) => o.paymentKey === "meal_card" && !o.mealCardSource);
  if (missingSource && trendyolConfigured() && Date.now() - start.getTime() < TY_REFETCH_MAX_AGE_MS) {
    try {
      await syncTrendyolPackagesRange(start.getTime(), Math.min(Date.now(), end.getTime() + TY_REFETCH_TAIL_MS));
      ty = await tyDayOrders(start, end);
    } catch {
      // API hatası: eldeki kayıtlarla devam (kodla ödemeler online görünür)
    }
  }

  const orders: EndOfDayOrder[] = [
    ...own.map((o): EndOfDayOrder => {
      const ms = new Date(o.createdAt).getTime();
      const method = o.payment?.method;
      const total = o.total ?? 0;
      const lines = (o.items ?? []).map((i) => ({
        name: i.product?.name ?? "—",
        qty: i.quantity ?? 1,
        amount: i.totalPrice ?? 0,
      }));
      return {
        key: `own:${o.id}`,
        id: o.id,
        orderNumber: String(o.orderNumber),
        channel: "own",
        customer: o.customer?.name || "—",
        createdAt: ms,
        time: istanbulHHMM(new Date(ms)),
        total,
        net: null,
        netEstimated: false,
        method: method && PAYMENT_KEYS.includes(method) ? method : "other",
        // Elle yazılan marka ("metropol") Trendyol'unkiyle ("Metropol") aynı kovaya düşsün.
        mealCardBrand:
          method === "meal_card" && o.payment?.mealCardBrand
            ? normalizeMealCardBrand(o.payment.mealCardBrand) ?? o.payment.mealCardBrand
            : null,
        split: isSplitPayment(o.payment)
          ? paymentParts(o.payment, total).map((p) => ({
              method: PAYMENT_KEYS.includes(p.method as PaymentKey) ? (p.method as PaymentKey) : "other",
              amount: p.amount,
              mealCardBrand:
                p.method === "meal_card" && p.mealCardBrand
                  ? normalizeMealCardBrand(p.mealCardBrand) ?? p.mealCardBrand
                  : null,
            }))
          : null,
        onDoor: false,
        courier: o.courier || null,
        durationMin: o.deliveryDurationMin ?? null,
        status: OWN_STATUS[o.status] ?? "active",
        open: o.paymentStatus === "open",
        itemCount: lines.reduce((s, l) => s + l.qty, 0),
        // Kendi siparişte komisyon yok: net = brüt.
        items: o.status === "cancelled" ? [] : spreadItems(lines, total, total),
        district: o.customer?.district || null,
      };
    }),
    ...ty.map((o): EndOfDayOrder => {
      const ms = o.packageCreationDate ? new Date(o.packageCreationDate).getTime() : start.getTime();
      const status = TY_STATUS[o.packageStatus ?? ""] ?? "active";
      const { net, estimated } = archivedNet(o);
      const method = TY_METHOD[o.paymentKey ?? ""] ?? "online";
      const total = o.totalPrice ?? 0;
      const lines = (o.lines ?? []).map((l) => ({
        name: l.name || "—",
        qty: l.quantity ?? 1,
        amount: (l.unitSellingPrice ?? 0) * (l.quantity ?? 1),
      }));
      return {
        key: `ty:${o.orderNumber}`,
        id: null,
        orderNumber: o.orderNumber,
        channel: "trendyol",
        customer: o.customerName || "Trendyol müşterisi",
        createdAt: ms,
        time: istanbulHHMM(new Date(ms)),
        total,
        net: status === "cancelled" ? 0 : net,
        netEstimated: estimated,
        method,
        mealCardBrand: method === "meal_card" ? o.mealCardBrand || "Diğer" : null,
        split: null,
        onDoor: method === "cash" || method === "card" || o.mealCardSource === "on_delivery",
        courier: o.courier || null,
        durationMin: o.deliveryDurationMin ?? null,
        status,
        open: false,
        itemCount: lines.reduce((s, l) => s + l.qty, 0),
        items: status === "cancelled" ? [] : spreadItems(lines, total, net),
        district: o.neighborhood || o.district || null,
      };
    }),
  ].sort((a, b) => b.createdAt - a.createdAt);

  return { orders, deliveryTargetMin };
}

// ─── Snapshot (dondurulmuş gün sonu) ───────────────────────────────────────────
// getEndOfDayReport ANLIK hesaplar; bu katman o özeti DB'ye sabitler ve okur.

export type SnapshotSource = "cron" | "manual";

// Geçen aynı güne (−7 gün) kıyas — yalnız o gün KAPATILMIŞSA (snapshot varsa)
// dolar; aksi halde null (kıyas gösterilmez).
export interface EndOfDayComparison {
  date: string; // geçen aynı gün ISO (YYYY-MM-DD)
  totalRevenue: number;
  packageCount: number;
}

export interface EndOfDayResult {
  report: EndOfDayReport;
  closed: boolean; // bu gün dondurulmuş bir snapshot'a sahip mi
  closedAt: string | null; // ISO timestamp
  source: SnapshotSource | null;
  cashCounted: number | null; // elle girilen nakit kasa toplamı
  cardCounted: number | null; // elle girilen kredi kartı (POS) toplamı
  ibanCounted: number | null; // elle girilen IBAN / havale toplamı
  ticketCounted: number | null; // elle girilen yemek kartı (ticket) toplamı
  comparison: EndOfDayComparison | null; // geçen aynı güne kıyas
}

// Geçen aynı günün (−7) snapshot özetini döner; yoksa null.
async function getComparison(iso: string): Promise<EndOfDayComparison | null> {
  const prev = shiftIso(iso, -7);
  const snap = await EndOfDaySnapshotModel.findOne({ date: prev })
    .select({ totalRevenue: 1, packageCount: 1 })
    .lean<{ totalRevenue?: number; packageCount?: number }>();
  if (!snap) return null;
  return {
    date: prev,
    totalRevenue: snap.totalRevenue ?? 0,
    packageCount: snap.packageCount ?? 0,
  };
}

interface SnapshotLean {
  date: string;
  report: EndOfDayReport;
  closedAt?: Date;
  source?: SnapshotSource;
  cashCounted?: number | null;
  cardCounted?: number | null;
  ibanCounted?: number | null;
  ticketCounted?: number | null;
}

// Elle girilen kasa sayımı — gün kapatılırken kaydedilir. Alan verilmezse
// (undefined) snapshot'taki mevcut değer korunur (cron bu yüzden hiç göndermez).
export interface ManualCashCount {
  cash?: number | null;
  card?: number | null;
  iban?: number | null;
  ticket?: number | null;
}

// O günün raporunu hesaplar ve EndOfDaySnapshot'a upsert eder (dondurur).
// Hem cron hem "Günü Kapat" butonu bunu çağırır → tek kaynak. İdempotent:
// kapalı gün tekrar çağrılırsa üzerine yazar.
export async function saveEndOfDaySnapshot(
  dateStr: string,
  source: SnapshotSource = "manual",
  counts?: ManualCashCount,
): Promise<EndOfDayReport> {
  await connectDB();
  const report = await getEndOfDayReport(dateStr);

  const set: Record<string, unknown> = {
    report,
    totalRevenue: report.totalRevenue,
    packageCount: report.packageCount,
    closedAt: new Date(),
    source,
  };
  // Yalnızca açıkça verilen kasa sayımlarını yaz; undefined alana dokunma ki
  // cron kapanışı (counts hiç göndermez) elle girilen değerleri ezmesin.
  if (counts?.cash !== undefined) set.cashCounted = counts.cash;
  if (counts?.card !== undefined) set.cardCounted = counts.card;
  if (counts?.iban !== undefined) set.ibanCounted = counts.iban;
  if (counts?.ticket !== undefined) set.ticketCounted = counts.ticket;

  await EndOfDaySnapshotModel.findOneAndUpdate(
    { date: report.date },
    { $set: set },
    { upsert: true },
  );
  return report;
}

// Arşiv listesi — kapatılmış (dondurulmuş) günlerin özeti, en yeni üstte.
export interface EndOfDaySnapshotSummary {
  date: string; // YYYY-MM-DD
  totalRevenue: number;
  packageCount: number;
  closedAt: string | null; // ISO
  source: SnapshotSource | null; // cron | manual
}

export async function listEndOfDaySnapshots(limit = 60): Promise<EndOfDaySnapshotSummary[]> {
  await connectDB();
  const snaps = await EndOfDaySnapshotModel.find({})
    .select({ date: 1, totalRevenue: 1, packageCount: 1, closedAt: 1, source: 1 })
    .sort({ date: -1 })
    .limit(limit)
    .lean<
      Array<{
        date: string;
        totalRevenue?: number;
        packageCount?: number;
        closedAt?: Date;
        source?: SnapshotSource;
      }>
    >();
  return snaps.map((s) => ({
    date: s.date,
    totalRevenue: s.totalRevenue ?? 0,
    packageCount: s.packageCount ?? 0,
    closedAt: s.closedAt?.toISOString() ?? null,
    source: s.source ?? null,
  }));
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
    cashCounted: snap.cashCounted ?? null,
    cardCounted: snap.cardCounted ?? null,
    ibanCounted: snap.ibanCounted ?? null,
    ticketCounted: snap.ticketCounted ?? null,
    comparison: await getComparison(dateStr),
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
        cashCounted: snap.cashCounted ?? null,
        cardCounted: snap.cardCounted ?? null,
        ibanCounted: snap.ibanCounted ?? null,
        ticketCounted: snap.ticketCounted ?? null,
        comparison: await getComparison(iso),
      };
    }
    return {
      report: await getEndOfDayReport(iso),
      closed: false,
      closedAt: null,
      source: null,
      cashCounted: null,
      cardCounted: null,
      ibanCounted: null,
      ticketCounted: null,
      comparison: await getComparison(iso),
    };
  }

  // Bugün / açık gün: snapshot durumu yalnızca "Kapatıldı" rozetini etkiler,
  // raporu her halükarda canlı hesaplıyoruz → iki sorguyu paralel çalıştır
  // (ardışık iki DB gidiş-dönüşü yerine tek tur, hot path'in gecikmesini düşürür).
  const [snap, report, comparison] = await Promise.all([
    EndOfDaySnapshotModel.findOne({ date: iso }).lean<SnapshotLean>(),
    getEndOfDayReport(iso),
    getComparison(iso),
  ]);
  return {
    report,
    closed: !!snap,
    closedAt: snap?.closedAt?.toISOString() ?? null,
    source: snap?.source ?? null,
    cashCounted: snap?.cashCounted ?? null,
    cardCounted: snap?.cardCounted ?? null,
    ibanCounted: snap?.ibanCounted ?? null,
    ticketCounted: snap?.ticketCounted ?? null,
    comparison,
  };
}
