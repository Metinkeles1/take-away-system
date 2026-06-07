"use server";

// Trendyol GO Yemek dashboard'u — doğrudan Trendyol API'sından okur, DB'ye
// yazmaz. Period seçimine göre /packages endpoint'i sorgulanır, paket listesi
// üzerinden ciro/sipariş/ödeme/saatlik dağılım hesaplanır.

import { unstable_cache } from "next/cache";
import {
  listTrendyolPackages,
  listTrendyolSettlements,
  type TrendyolPackage,
  type TrendyolSettlement,
  type TrendyolSettlementTransactionType,
} from "@/lib/integrations/trendyol/client";
import { istanbulDayStart } from "@/lib/datetime";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrendyolPeriod = "today" | "week" | "month";

export interface PaymentBreakdownItem {
  key: string;
  label: string;
  count: number;
  revenue: number;
}

// Detay modal'da gösterilen tüm alanları kapsar. Trendyol API'sından
// listTrendyolPackages ile gelen bilgi yeterli — ekstra çağrı yapmıyoruz.
export interface TrendyolRecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  status: string;
  paymentMethod: string;
  createdAt: number;
  netRevenue?: number;
  // ── Detay alanları ──
  customerPhone?: string;
  address?: {
    addressLine: string;
    city?: string;
    district?: string;
    neighborhood?: string;
    description?: string;
  };
  customerNote?: string;
  deliveryType: "STORE" | "GO";
  lines: {
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    modifiers: { name: string; price: number }[];
    description?: string;
    cancelledCount: number;
  }[];
}

export interface MealCardBreakdownItem {
  brand: string;       // Multinet, Sodexo, Metropol, Ticket, Setcard, Edenred, Pluxee, Diğer
  count: number;
  revenue: number;
  source: "online" | "on_delivery";  // online (PAY_WITH_MEAL_CARD) | kapıda kod (PAY_WITH_ON_DELIVERY)
}

export interface TrendyolCategoryEarning {
  count: number;
  gross: number;        // Tutar toplamı (brüt)
  trendyolNet: number;  // Trendyol "Satıcı Hakediş" = Tutar − Komisyon − İndirim
  bankNet: number;      // sağlayıcı %10 sonrası bankaya gelen (kart/nakitte = trendyolNet)
}

export interface TrendyolDashboardStats {
  period: TrendyolPeriod;
  fetchedAt: string; // ISO
  rangeStart: number;
  rangeEnd: number;

  // Özet (cancelled/unsupplied hariç)
  orderCount: number;
  deliveredCount: number;
  cancelledCount: number;
  revenue: number;
  avgBasket: number;

  // Dağılımlar
  paymentBreakdown: PaymentBreakdownItem[];
  mealCardBreakdown: MealCardBreakdownItem[];
  statusBreakdown: { status: string; count: number }[];
  hourly: { hour: number; orders: number; revenue: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];

  recentOrders: TrendyolRecentOrder[];

  // ─── Finansal özet (settlements API'sından) ───────────────────────────
  // settlementsAvailable=false ise endpoint çağrısı başarısız olmuş demektir;
  // orderCount/revenue gibi packages alanları yine doludur.
  settlementsAvailable: boolean;
  settlementsError?: string;
  finance: {
    grossSales: number;       // Sale.credit toplamı (brüt satış)
    totalDiscount: number;    // Discount.debt − DiscountCancel.credit (net indirim)
    totalCoupon: number;      // Coupon.debt − CouponCancel.credit (satıcı kuponu)
    totalRefund: number;      // Return.debt + ManualRefund.debt − iptaller
    totalCommission: number;  // tüm transactionType'larda commissionAmount işaretli toplam
    netRevenue: number;       // settlement sellerRevenue toplamı (online kart — gerçek)
  };

  // ─── Hakediş (Trendyol ödeme yöntemi kategorileri) ────────────────────
  // Trendyol Satışlar sayfasıyla birebir kıyaslanabilsin diye 3 kategori:
  // Kredi Kartı (online) / Yemek Kartı (online ticket) / Kapıda Ödeme
  // (PAY_WITH_ON_DELIVERY — kod ile + nakit + kart). Her kategoride:
  //   trendyolNet = Tutar − Komisyon − İndirim (Trendyol "Satıcı Hakediş")
  //   bankNet     = yemek kartı kalemlerinde sağlayıcı %10 sonrası, kart/nakitte = trendyolNet
  earnings: {
    commissionRate: number;   // settlement'tan türetilen efektif Trendyol komisyon oranı
    creditCard: TrendyolCategoryEarning;  // Kredi Kartı (PAY_WITH_CARD) — net settlement'tan GERÇEK
    ticket: TrendyolCategoryEarning;       // Yemek Kartı (PAY_WITH_MEAL_CARD) — tahmini
    onDelivery: TrendyolCategoryEarning;   // Kapıda Ödeme (PAY_WITH_ON_DELIVERY) — bilgi amaçlı
    // ÖNEMLİ: kapıda ödemeler hakediş TOPLAMINA dahil DEĞİL — işletme içi ciroda
    // ayrıca sayıldığı için mükerrer kayıt olmasın. Toplam yalnız kart + yemek kartı.
    totalTrendyolNet: number; // Kredi Kartı + Yemek Kartı Trendyol hakediş toplamı
    totalBankNet: number;     // sağlayıcı %10 sonrası bankaya gelen tahmini toplam (kapıda HARİÇ)
  };

  // API erişilemezse / env eksikse buradan akar
  error?: string;
}

// Trendyol paymentType -> proje genelindeki ortak ödeme key'i (PAYMENT_LABELS).
// On-delivery için sub-type (CASH/CARD) okunur, yoksa "cash" varsayılır.
function paymentKey(p: TrendyolPackage): string {
  const t = p.payment?.paymentType;
  if (t === "PAY_WITH_CARD") return "online";
  if (t === "PAY_WITH_MEAL_CARD") return "meal_card";
  if (t === "PAY_WITH_ON_DELIVERY") {
    const sub = p.payment?.onDelivery?.paymentType?.toUpperCase();
    if (sub === "CARD") return "card";
    if (sub === "CASH" || !sub) return "cash";
    // METROPOL_CODE / MULTINET_CODE vb. → "kod ile" yemek kartı. Para kapıda DEĞİL,
    // sağlayıcıdan bankaya gelir → online yemek kartı gibi hakedişe yazılır.
    if (normalizeMealCardBrand(sub)) return "meal_card";
    return "cash";
  }
  return "online";
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kapıda Kart",
  online: "Online Kart",
  meal_card: "Yemek Kartı",
};

// Trendyol'un yemek kartı identifier'larını ortak marka adına normalize eder.
// cardSourceType (online ödeme) ve onDelivery.paymentType (kapıda kod) için ortak.
function normalizeMealCardBrand(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s.includes("MULTINET")) return "Multinet";
  if (s.includes("SODEXO") || s.includes("PLUXEE")) return "Sodexo / Pluxee";
  if (s.includes("METROPOL")) return "Metropol";
  if (s.includes("TICKET")) return "Ticket";
  if (s.includes("SETCARD") || s.includes("SET_CARD")) return "Setcard";
  if (s.includes("EDENRED") || s.includes("WINWIN") || s.includes("WIN_WIN")) return "Edenred";
  if (s.includes("TOKENFLEX") || s.includes("TOKEN_FLEX")) return "TokenFlex";
  if (s.includes("PAYE")) return "Paye";
  if (s.includes("SMARTPAY") || s.includes("SMART_PAY")) return "SmartPay";
  return null;
}

// Bir paketin yemek kartı bilgisini (varsa) çıkarır. Yoksa null döner.
function mealCardInfo(
  p: TrendyolPackage,
): { brand: string; source: "online" | "on_delivery" } | null {
  const t = p.payment?.paymentType;
  if (t === "PAY_WITH_MEAL_CARD") {
    const brand = normalizeMealCardBrand(p.payment?.mealCard?.cardSourceType) ?? "Diğer";
    return { brand, source: "online" };
  }
  if (t === "PAY_WITH_ON_DELIVERY") {
    const sub = p.payment?.onDelivery?.paymentType;
    const brand = normalizeMealCardBrand(sub);
    if (brand) return { brand, source: "on_delivery" };
  }
  return null;
}

const NON_REVENUE_STATUSES = new Set(["Cancelled", "UnSupplied"]);

// ─── Hakediş tahmini ─────────────────────────────────────────────────────
// Trendyol Satışlar sayfasından doğrulanan formül (her ödeme yöntemi için aynı):
//   Trendyol "Satıcı Hakediş" = Tutar − Komisyon − İndirim
//                             = (Tutar − İndirim) × (1 − komisyon oranı)
// İndirim = promotions[].totalSellerAmount (+kupon) — gerçek, API'dan gelir.
// Komisyon oranı API'da yemek kartı/kapıda siparişlerinde YOK; ama oran ödeme
// kanalına göre DEĞİŞMİYOR (online kart, ticket, kapıda hepsi aynı dönem oranı).
// Bu yüzden oranı online kartın GERÇEK settlement verisinden türetip diğerlerine
// uyguluyoruz (deriveCommissionRate). Online kartın neti zaten settlement'tan
// GERÇEK gelir; sadece ticket/kapıda tahmin edilir.
//
// Sağlayıcı kesintisi: yemek kartı (Multinet/Sodexo/Edenred…) parayı bankaya
// yatırırken ayrıca %10 keser. Online kart/nakitte sağlayıcı yok → kesinti yok.
const PROVIDER_COMMISSION_RATE = 0.1;
const FALLBACK_COMMISSION_RATE = 0.138; // settlement yoksa kullanılacak oran

// Satıcının karşıladığı indirim (promosyon + kupon).
function sellerDiscount(p: TrendyolPackage): number {
  return (
    (p.promotions ?? []).reduce((s, pr) => s + (pr.totalSellerAmount ?? 0), 0) +
    (p.coupon?.totalSellerAmount ?? 0)
  );
}

// Trendyol "Satıcı Hakediş" = (Tutar − İndirim) × (1 − komisyon).
function estimateTrendyolNet(p: TrendyolPackage, commissionRate: number): number {
  const base = Math.max((p.totalPrice ?? 0) - sellerDiscount(p), 0);
  return base * (1 - commissionRate);
}


// API'a gönderilen aralık, gerçek period aralığından geriye doğru tampon içerir.
// Sebep: /packages endpoint'i `packageModificationDate` ile filtreler — eski bir
// sipariş bugün teslim/iptal olursa bugünkü filtreye düşer ama sipariş tarihi
// değildir. Settlement endpoint'i ise `transactionDate` ile filtreler ama her
// kayıtta `orderDate` alanı var. Her iki kaynaktan gelen veriyi client-side
// `packageCreationDate` / `orderDate` ile gerçek period'a daraltıyoruz.
const API_BUFFER_MS = 14 * 24 * 60 * 60 * 1000;

function apiRange(
  period: TrendyolPeriod,
  referenceDate?: number,
): { start: number; end: number } {
  const r = periodRange(period, referenceDate);
  return { start: r.start - API_BUFFER_MS, end: r.end };
}

// Settlement endpoint `transactionDate` ile filtreler ama her kayıtta `orderDate`
// var. Bir siparişin orderDate'i 14.05 olsa bile, settlement kaydının
// transactionDate'i vade tarihinde (örn. 16.05) oluşur. Bu yüzden settlement
// çağrılarında end'i her zaman `now + 30 gün`'e kadar uzatıp client-side
// `orderDate` ile daraltıyoruz — aksi halde geçmiş bir günün siparişlerinin
// vade tarihinde oluşan settlement kayıtları kaçar.
const SETTLEMENT_FORWARD_BUFFER_MS = 30 * 24 * 60 * 60 * 1000;
function settlementApiRange(
  period: TrendyolPeriod,
  referenceDate?: number,
): { start: number; end: number } {
  const r = periodRange(period, referenceDate);
  return {
    start: r.start - API_BUFFER_MS,
    end: Math.max(r.end, Date.now() + SETTLEMENT_FORWARD_BUFFER_MS),
  };
}

// referenceDate verilmezse "bugün" referans alınır. Verilirse o günün sonu
// (23:59:59.999) referans olur; "today" o günün 00:00-23:59 aralığını verir,
// week/month geriye doğru 7/30 günlük pencereyi referans günde biten şekilde
// döndürür.
//
// Tüm gün sınırları Istanbul TZ'sine göre normalize. Sebep: Vercel UTC çalışır,
// `new Date(y, m, d)` lokal TZ'ye göre gece yarısı verir → "today" sorgusu
// dünün geç saatlerini kapsıyor. Detay: @/lib/datetime
function periodRange(
  period: TrendyolPeriod,
  referenceDate?: number,
): { start: number; end: number } {
  const now = Date.now();
  const refTs = referenceDate ?? now;

  const startOfRef = istanbulDayStart(refTs).getTime();
  const todayStart = istanbulDayStart(now).getTime();
  const isReferenceToday = startOfRef === todayStart;

  // Geçmiş gün için end = referans gününün sonu (sonraki Istanbul gün başı − 1ms).
  // Bugün için end = "şimdi".
  const endOfRef = isReferenceToday ? now : startOfRef + DAY_MS - 1;

  if (period === "today") return { start: startOfRef, end: endOfRef };

  const daysBack = period === "week" ? 6 : 29;
  return { start: startOfRef - daysBack * DAY_MS, end: endOfRef };
}

function emptyStats(
  period: TrendyolPeriod,
  start: number,
  end: number,
  error?: string,
): TrendyolDashboardStats {
  return {
    period,
    fetchedAt: new Date().toISOString(),
    rangeStart: start,
    rangeEnd: end,
    orderCount: 0,
    deliveredCount: 0,
    cancelledCount: 0,
    revenue: 0,
    avgBasket: 0,
    paymentBreakdown: [],
    mealCardBreakdown: [],
    statusBreakdown: [],
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 })),
    topProducts: [],
    recentOrders: [],
    settlementsAvailable: false,
    finance: {
      grossSales: 0,
      totalDiscount: 0,
      totalCoupon: 0,
      totalRefund: 0,
      totalCommission: 0,
      netRevenue: 0,
    },
    earnings: {
      commissionRate: 0,
      creditCard: { count: 0, gross: 0, trendyolNet: 0, bankNet: 0 },
      ticket: { count: 0, gross: 0, trendyolNet: 0, bankNet: 0 },
      onDelivery: { count: 0, gross: 0, trendyolNet: 0, bankNet: 0 },
      totalTrendyolNet: 0,
      totalBankNet: 0,
    },
    error,
  };
}

// Settlement endpoint'inde tarih aralığı max 15 gün → daha uzun period'lar için
// chunk'lara böl, paralel çağır, content'leri birleştir.
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

function chunkRange(start: number, end: number): Array<{ s: number; e: number }> {
  const chunks: Array<{ s: number; e: number }> = [];
  let cursor = start;
  while (cursor < end) {
    const next = Math.min(cursor + FIFTEEN_DAYS_MS - 1, end);
    chunks.push({ s: cursor, e: next });
    cursor = next + 1;
  }
  return chunks.length ? chunks : [{ s: start, e: end }];
}

async function fetchSettlementType(
  type: TrendyolSettlementTransactionType,
  start: number,
  end: number,
): Promise<{ ok: true; items: TrendyolSettlement[] } | { ok: false; error: string }> {
  const chunks = chunkRange(start, end);
  const all: TrendyolSettlement[] = [];

  for (const { s, e } of chunks) {
    let page = 0;
    while (page < 50) {
      const res = await listTrendyolSettlements({
        transactionType: type,
        startDate: s,
        endDate: e,
        page,
        size: 1000,
      });
      if (!res.ok) {
        return { ok: false, error: `${type} (${res.status}): ${res.error}` };
      }
      all.push(...(res.data.content ?? []));
      const totalPages = res.data.totalPages ?? 1;
      if (page + 1 >= totalPages) break;
      page++;
    }
  }
  return { ok: true, items: all };
}

const FINANCE_TYPES: TrendyolSettlementTransactionType[] = [
  "Sale",
  "Return",
  "Discount",
  "DiscountCancel",
  "Coupon",
  "CouponCancel",
  "ManualRefund",
  "ManualRefundCancel",
];

// Trendyol sellerRevenue ve commissionAmount değerlerini her transactionType için
// MUTLAK (pozitif) gönderiyor; işaret transactionType'tan çıkarılır.
// Doküman tablosundan: + = satıcı lehine, − = satıcı aleyhine.
const TYPE_SIGN: Record<TrendyolSettlementTransactionType, 1 | -1> = {
  Sale: 1,
  DiscountCancel: 1,
  CouponCancel: 1,
  ManualRefundCancel: 1,
  ProvisionPositive: 1,
  Return: -1,
  Discount: -1,
  Coupon: -1,
  ManualRefund: -1,
  ProvisionNegative: -1,
};

async function aggregateFinance(
  apiStart: number,
  apiEnd: number,
  targetStart: number,
  targetEnd: number,
): Promise<{
  finance: TrendyolDashboardStats["finance"];
  netByOrder: Map<string, number>;
  ok: boolean;
  error?: string;
}> {
  const results = await Promise.all(
    FINANCE_TYPES.map((t) => fetchSettlementType(t, apiStart, apiEnd)),
  );

  const finance = {
    grossSales: 0,
    totalDiscount: 0,
    totalCoupon: 0,
    totalRefund: 0,
    totalCommission: 0,
    netRevenue: 0,
  };
  const netByOrder = new Map<string, number>();
  let firstError: string | undefined;

  results.forEach((res, i) => {
    if (!res.ok) {
      firstError ??= res.error;
      return;
    }
    const type = FINANCE_TYPES[i];

    const sign = TYPE_SIGN[type];

    for (const item of res.items) {
      const debt = item.debt ?? 0;
      const credit = item.credit ?? 0;
      const seller = item.sellerRevenue ?? 0;
      const commission = item.commissionAmount ?? 0;
      const signedSeller = seller * sign;

      // OrderNumber bazlı haritaları RANGE FİLTRESİ OLMADAN topla.
      // Sale'in transactionDate'i vade tarihinde (sipariş tarihinden gün sonra)
      // oluşabilir; orderDate alanı boş gelirse target range dışına düşer ve
      // map'e hiç girmez. Map'leri kayıtları olduğu gibi indeksliyoruz —
      // paket eşleştirmesi orderNumber üzerinden yapılır, tarih önemi yok.
      if (item.orderNumber) {
        netByOrder.set(
          item.orderNumber,
          (netByOrder.get(item.orderNumber) ?? 0) + signedSeller,
        );
      }

      // Toplam finans rakamları (Brüt/İndirim/Komisyon/Net Hakediş vb.) için
      // target range filtresi: bu kalemler "şu period'da gerçekleşen" hesabı.
      const refDate = item.orderDate ?? item.transactionDate ?? 0;
      if (refDate < targetStart || refDate > targetEnd) continue;

      finance.netRevenue += signedSeller;
      finance.totalCommission += Math.abs(commission);

      if (type === "Sale") finance.grossSales += credit;
      else if (type === "Discount") finance.totalDiscount += debt;
      else if (type === "DiscountCancel") finance.totalDiscount -= credit;
      else if (type === "Coupon") finance.totalCoupon += debt;
      else if (type === "CouponCancel") finance.totalCoupon -= credit;
      else if (type === "Return") finance.totalRefund += debt;
      else if (type === "ManualRefund") finance.totalRefund += debt;
      else if (type === "ManualRefundCancel") finance.totalRefund -= credit;
    }
  });

  return {
    finance,
    netByOrder,
    ok: !firstError,
    error: firstError,
  };
}

async function fetchAllPackages(
  start: number,
  end: number,
): Promise<{ ok: true; packages: TrendyolPackage[] } | { ok: false; error: string }> {
  // Trendyol API size üst sınırı 50 (FilterRequest.Size lte). 200'de BindError döner.
  const size = 50;

  // İlk sayfayı çek, totalPages'i öğren, kalanları paralel çek (sıralı loop yerine).
  const firstRes = await listTrendyolPackages({
    modificationStartDate: start,
    modificationEndDate: end,
    page: 0,
    size,
  });
  if (!firstRes.ok) {
    return { ok: false, error: `Trendyol API hatası (${firstRes.status}): ${firstRes.error}` };
  }
  const totalPages = Math.min(firstRes.data.totalPages ?? 1, 200);
  const packages: TrendyolPackage[] = [...(firstRes.data.content ?? [])];

  if (totalPages <= 1) return { ok: true, packages };

  // Kalan sayfaları paralel çek, ama rate-limit için 5'er batch halinde.
  const BATCH = 5;
  for (let pageStart = 1; pageStart < totalPages; pageStart += BATCH) {
    const pageNums = Array.from(
      { length: Math.min(BATCH, totalPages - pageStart) },
      (_, i) => pageStart + i,
    );
    const results = await Promise.all(
      pageNums.map((page) =>
        listTrendyolPackages({
          modificationStartDate: start,
          modificationEndDate: end,
          page,
          size,
        }),
      ),
    );
    for (const r of results) {
      if (!r.ok) {
        return { ok: false, error: `Trendyol API hatası (${r.status}): ${r.error}` };
      }
      packages.push(...(r.data.content ?? []));
    }
  }
  return { ok: true, packages };
}

// ─── Cache layer ───────────────────────────────────────────────────
// Aynı (period, gün) için arka arkaya gelen istekler API'yi tekrar
// vurmasın. "Bugün" verisi 60sn, geçmiş günler 10dk cache'lenir
// (geçmiş veriler immutable). Cache key gün granülaritesinde — saat/ms
// farkları cache miss'e yol açmaz.

// Cache key Istanbul gününe göre — yoksa Vercel'de UTC günü flip olur ve
// Istanbul 03:00'da "bugün" cache'i farklı key'e düşer.
function dateKey(referenceDate?: number): string {
  const start = istanbulDayStart(referenceDate ?? Date.now());
  // Istanbul midnight UTC ms'i → Istanbul gün bileşenlerini al
  const istMs = start.getTime() + 3 * 60 * 60 * 1000;
  const d = new Date(istMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isReferenceToday(referenceDate?: number): boolean {
  if (referenceDate === undefined) return true;
  return (
    istanbulDayStart(referenceDate).getTime() === istanbulDayStart().getTime()
  );
}

// Cache key argümanları: [period, key]. Aynı period+gün → aynı cache.
// Key sonundaki v2: recentOrders schema'sı lines/address vb. detay alanlarıyla
// genişledikten sonra eski cache'i invalide etmek için bumped.
const cachedComputeToday = unstable_cache(
  async (period: TrendyolPeriod, _key: string, refTs: number) =>
    computeTrendyolDashboardStats(period, refTs),
  ["trendyol-dashboard-today-v10"],
  { revalidate: 60 },
);

const cachedComputePast = unstable_cache(
  async (period: TrendyolPeriod, _key: string, refTs: number) =>
    computeTrendyolDashboardStats(period, refTs),
  ["trendyol-dashboard-past-v10"],
  { revalidate: 600 },
);

export async function getTrendyolDashboardStats(
  period: TrendyolPeriod = "today",
  referenceDate?: number,
): Promise<TrendyolDashboardStats> {
  const key = dateKey(referenceDate);
  const refTs = referenceDate ?? Date.now();
  const fn = isReferenceToday(referenceDate) ? cachedComputeToday : cachedComputePast;
  return fn(period, key, refTs);
}

async function computeTrendyolDashboardStats(
  period: TrendyolPeriod,
  referenceDate?: number,
): Promise<TrendyolDashboardStats> {
  const { start, end } = periodRange(period, referenceDate);

  // API çağrılarına geriye doğru tampon ekle, sonra client-side daralt.
  // Settlement için end ileriye uzatılır (vade tarihinde oluşan kayıtları
  // kaçırmamak için); packages aynı kalır.
  const { start: pkgApiStart, end: pkgApiEnd } = apiRange(period, referenceDate);
  const { start: setApiStart, end: setApiEnd } = settlementApiRange(period, referenceDate);

  let packagesResult: Awaited<ReturnType<typeof fetchAllPackages>>;
  let financeResult: Awaited<ReturnType<typeof aggregateFinance>>;
  try {
    [packagesResult, financeResult] = await Promise.all([
      fetchAllPackages(pkgApiStart, pkgApiEnd),
      aggregateFinance(setApiStart, setApiEnd, start, end),
    ]);
  } catch (err) {
    return emptyStats(
      period,
      start,
      end,
      err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı",
    );
  }

  if (!packagesResult.ok) {
    return emptyStats(period, start, end, packagesResult.error);
  }
  // Sadece sipariş tarihi (packageCreationDate) target period içinde olanları say.
  const packages = packagesResult.packages.filter(
    (p) => p.packageCreationDate >= start && p.packageCreationDate <= end,
  );

  const completed = packages.filter((p) => !NON_REVENUE_STATUSES.has(p.packageStatus));
  const delivered = packages.filter((p) => p.packageStatus === "Delivered");
  const cancelled = packages.filter((p) => NON_REVENUE_STATUSES.has(p.packageStatus));

  const revenue = completed.reduce((s, p) => s + (p.totalPrice ?? 0), 0);
  const avgBasket = completed.length > 0 ? revenue / completed.length : 0;

  // Ödeme dağılımı (ortak PAYMENT_LABELS key'lerine normalize)
  const paymentMap = new Map<string, { count: number; revenue: number }>();
  for (const p of completed) {
    const key = paymentKey(p);
    const cur = paymentMap.get(key) ?? { count: 0, revenue: 0 };
    cur.count++;
    cur.revenue += p.totalPrice ?? 0;
    paymentMap.set(key, cur);
  }
  const paymentBreakdown: PaymentBreakdownItem[] = [...paymentMap.entries()]
    .map(([key, v]) => ({
      key,
      label: PAYMENT_LABEL[key] ?? key,
      count: v.count,
      revenue: v.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ─── Hakediş kategorileri (Trendyol ödeme yöntemleri) ───────────────────
  // Komisyon oranını online kartın GERÇEK netinden tersine çöz:
  //   oran = 1 − (gerçek net / baz),  baz = Tutar − İndirim.
  // (finance.totalCommission kullanılamaz — Sale+Discount'ta çifte sayılıyor.)
  // Türetilen oran ticket/kapıda tahminlerinde kullanılır (oran kanala göre
  // değişmez, aynı dönem oranı). Settlement yoksa FALLBACK.
  let ocNet = 0;
  let ocBase = 0;
  for (const p of completed) {
    if (p.payment?.paymentType !== "PAY_WITH_CARD") continue;
    const real = financeResult.netByOrder.get(p.orderNumber);
    if (real === undefined) continue; // sadece settlement'a düşmüş kartlar oranı belirler
    ocNet += real;
    ocBase += Math.max((p.totalPrice ?? 0) - sellerDiscount(p), 0);
  }
  const commissionRate =
    ocBase > 0
      ? Math.min(Math.max(1 - ocNet / ocBase, 0), 0.5)
      : FALLBACK_COMMISSION_RATE;

  const mkCat = (): TrendyolCategoryEarning => ({
    count: 0,
    gross: 0,
    trendyolNet: 0,
    bankNet: 0,
  });
  const creditCard = mkCat(); // Kredi Kartı (PAY_WITH_CARD) — net settlement'tan GERÇEK
  const ticket = mkCat();      // Yemek Kartı (PAY_WITH_MEAL_CARD)
  const onDelivery = mkCat();  // Kapıda Ödeme (PAY_WITH_ON_DELIVERY) — toplamlara DAHİL DEĞİL

  for (const p of completed) {
    const t = p.payment?.paymentType;
    const gross = p.totalPrice ?? 0;
    if (t === "PAY_WITH_CARD") {
      creditCard.count++;
      creditCard.gross += gross;
      // Online kartın neti settlement'ta GERÇEK var; yoksa (henüz oluşmadıysa) tahmin.
      const real = financeResult.netByOrder.get(p.orderNumber);
      const net = real ?? estimateTrendyolNet(p, commissionRate);
      creditCard.trendyolNet += net;
      creditCard.bankNet += net; // online kartta sağlayıcı kesintisi yok
    } else if (t === "PAY_WITH_MEAL_CARD") {
      const net = estimateTrendyolNet(p, commissionRate);
      ticket.count++;
      ticket.gross += gross;
      ticket.trendyolNet += net;
      ticket.bankNet += net * (1 - PROVIDER_COMMISSION_RATE);
    } else if (t === "PAY_WITH_ON_DELIVERY") {
      const net = estimateTrendyolNet(p, commissionRate);
      onDelivery.count++;
      onDelivery.gross += gross;
      onDelivery.trendyolNet += net;
      // "kod ile" yemek kartı → sağlayıcı %10; gerçek nakit/kart → kesinti yok.
      const isCode = normalizeMealCardBrand(p.payment?.onDelivery?.paymentType) !== null;
      onDelivery.bankNet += isCode ? net * (1 - PROVIDER_COMMISSION_RATE) : net;
    }
  }

  // Toplamlar YALNIZ kart + yemek kartı. Kapıda ödeme işletme içi ciroda
  // ayrıca sayıldığı için hakediş toplamına eklenmez (mükerrer kayıt önlenir).
  const earnings = {
    commissionRate,
    creditCard,
    ticket,
    onDelivery,
    totalTrendyolNet: creditCard.trendyolNet + ticket.trendyolNet,
    totalBankNet: creditCard.bankNet + ticket.bankNet,
  };

  // Yemek kartı marka dağılımı — marka+kaynak bazında AYRI satır (online vs kapıda).
  // Böylece online Multinet ile kapıda Multinet karışmaz; modal kaynağa göre süzer.
  const mealCardMap = new Map<
    string,
    { brand: string; source: "online" | "on_delivery"; count: number; revenue: number }
  >();
  for (const p of completed) {
    const info = mealCardInfo(p);
    if (!info) continue;
    const key = `${info.brand}|${info.source}`;
    const cur = mealCardMap.get(key) ?? {
      brand: info.brand,
      source: info.source,
      count: 0,
      revenue: 0,
    };
    cur.count++;
    cur.revenue += p.totalPrice ?? 0;
    mealCardMap.set(key, cur);
  }
  const mealCardBreakdown: MealCardBreakdownItem[] = [...mealCardMap.values()].sort(
    (a, b) => b.revenue - a.revenue,
  );

  // Durum dağılımı
  const statusMap = new Map<string, number>();
  for (const p of packages) {
    statusMap.set(p.packageStatus, (statusMap.get(p.packageStatus) ?? 0) + 1);
  }
  const statusBreakdown = [...statusMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Saatlik dağılım (24 bucket)
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
  for (const p of completed) {
    const h = new Date(p.packageCreationDate).getHours();
    if (h >= 0 && h < 24) {
      hourly[h].orders++;
      hourly[h].revenue += p.totalPrice ?? 0;
    }
  }

  // En çok satanlar
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  for (const p of completed) {
    for (const line of p.lines ?? []) {
      const qty = line.items?.length ?? 1;
      const unit = line.unitSellingPrice ?? line.price ?? 0;
      const cur = productMap.get(line.name) ?? { quantity: 0, revenue: 0 };
      cur.quantity += qty;
      cur.revenue += unit * qty;
      productMap.set(line.name, cur);
    }
  }
  const topProducts = [...productMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 20);

  // Son 8 sipariş — detay modal'ı için lines/address/customer alanları da dahil.
  // Trendyol API tek-paket endpoint'i sunmuyor; listeden çekilen veriyi modal
  // doğrudan kullanır, ekstra istek atılmaz.
  const recentOrders: TrendyolRecentOrder[] = [...packages]
    .sort((a, b) => b.packageCreationDate - a.packageCreationDate)
    .slice(0, 8)
    .map((p) => {
      const addr = p.address;
      const lines = (p.lines ?? []).map((line) => {
        const totalQty = line.items?.length ?? 1;
        const cancelledCount = (line.items ?? []).filter((i) => i.isCancelled).length;
        const unit = line.unitSellingPrice ?? line.price ?? 0;
        return {
          name: line.name,
          quantity: totalQty,
          unitPrice: unit,
          totalPrice: unit * totalQty,
          modifiers: (line.modifierProducts ?? []).map((m) => ({
            name: m.name,
            price: m.price,
          })),
          description: line.description,
          cancelledCount,
        };
      });

      return {
        id: p.id,
        orderNumber: p.orderNumber,
        customerName:
          [p.customer?.firstName, p.customer?.lastName].filter(Boolean).join(" ") ||
          "—",
        total: p.totalPrice ?? 0,
        status: p.packageStatus,
        paymentMethod: PAYMENT_LABEL[paymentKey(p)] ?? "—",
        createdAt: p.packageCreationDate,
        netRevenue: financeResult.netByOrder.get(p.orderNumber),
        customerPhone: addr?.phone,
        address: addr
          ? {
              addressLine:
                [addr.address1, addr.address2].filter(Boolean).join(" ") || "—",
              city: addr.city,
              district: addr.district,
              neighborhood: addr.neighborhood,
              description: addr.addressDescription,
            }
          : undefined,
        customerNote: p.customerNote,
        deliveryType: p.deliveryType,
        lines,
      };
    });


  return {
    period,
    fetchedAt: new Date().toISOString(),
    rangeStart: start,
    rangeEnd: end,
    orderCount: completed.length,
    deliveredCount: delivered.length,
    cancelledCount: cancelled.length,
    revenue,
    avgBasket,
    paymentBreakdown,
    mealCardBreakdown,
    statusBreakdown,
    hourly,
    topProducts,
    recentOrders,
    settlementsAvailable: financeResult.ok,
    settlementsError: financeResult.error,
    finance: financeResult.finance,
    earnings,
  };
}
