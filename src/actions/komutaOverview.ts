"use server";

// Komuta Merkezi veri katmanı — kanal filtresini gerçek anlamda birleştirir.
// Manuel/Getir/Yemeksepeti DB'den (getDashboardOverview); Trendyol ise canlı
// API'den (getTrendyolDashboardStats) gelir ve aynı DashboardOverview şekline
// map edilir. "Hepsi" = manuel(DB) + Trendyol(API) birleşimi.
//
// Üretilenler:
//  - split*  : ürün/ödeme/trend için Kendi vs Trendyol kırılımı (iki renkli çubuk)
//  - mealCardBrands : yemek kartı markası bazında tutar (Kendi DB + Trendyol API)
//  - trendyolOps    : Trendyol sipariş/teslim/iptal sayıları (operasyon kartları)
//
// Sınır: Trendyol API'si hafta/ay için GÜNLÜK trend vermez (yalnız saatlik) ve
// önceki dönem kıyası sağlamaz → Trendyol dahil görünümlerde delta gizlenir.

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import {
  getDashboardOverview,
  getPeriodOrders,
  type DashboardOverview,
  type PaymentKey,
} from "./dashboardOverview";
import {
  getTrendyolDashboardStats,
  getTrendyolPeriodOrders,
  type TrendyolDashboardStats,
  type TrendyolPeriodOrder,
} from "./trendyolDashboard";
import { type OrderSource } from "@/types";
import { periodWindows, type DashboardPeriod } from "@/lib/dashboardPeriods";

type Channel = OrderSource | "all";
type OverviewMetric = DashboardOverview["current"];

export interface ChannelQty {
  quantity: number;
  revenue: number;
}
export interface SplitTrendPoint {
  label: string;
  own: number;
  trendyol: number;
}
export interface SplitProduct {
  name: string;
  quantity: number;
  revenue: number;
  own: ChannelQty;
  trendyol: ChannelQty;
}
export interface SplitPayment {
  key: PaymentKey;
  label: string;
  amount: number;
  own: number;
  trendyol: number;
}
export interface MealCardBrandRow {
  brand: string;
  label: string;
  own: number;
  trendyol: number;
  amount: number;
}
export interface TrendyolOps {
  available: boolean;
  orderCount: number;
  delivered: number;
  cancelled: number;
}

export interface ChannelTotals {
  revenue: number;
  orderCount: number;
  net: number;
}
export interface KomutaBreakdown {
  own: ChannelTotals; // Trendyol dışı (kendi) tüm kanallar
  trendyol: ChannelTotals;
}

export interface KomutaOverview extends DashboardOverview {
  splitTrend: SplitTrendPoint[];
  splitProducts: SplitProduct[];
  splitPayments: SplitPayment[];
  mealCardBrands: MealCardBrandRow[];
  trendyolOps: TrendyolOps;
  breakdown: KomutaBreakdown; // KPI kartlarındaki Kendi/Trendyol çipleri için
}

type KomutaOverviewBase = Omit<KomutaOverview, "mealCardBrands" | "trendyolOps">;

// Birleşik sipariş satırı (KPI → siparişleri gör).
export interface KomutaOrderRow {
  id: string | null; // DB id (linklenir); Trendyol'da null
  orderNumber: string;
  channel: "own" | "trendyol";
  customerName: string;
  time: string; // HH:MM
  total: number;
  net: number;
  paymentLabel: string;
  district: string | null;
  status: string;
}

const PAYMENT_LABELS: Record<PaymentKey, string> = {
  cash: "Nakit",
  card: "Kart",
  online: "Online",
  meal_card: "Yemek Kartı",
  iban: "Havale",
};

const TY_PAYMENT_MAP: Record<string, PaymentKey> = {
  card: "card",
  credit_card: "card",
  meal_card: "meal_card",
  ticket: "meal_card",
  online: "online",
  cash: "cash",
  on_delivery: "cash",
  iban: "iban",
};

const BRAND_LABELS: Record<string, string> = {
  multinet: "Multinet",
  setcard: "Setcard",
  pluxee: "Pluxee",
  sodexo: "Sodexo",
  edenred: "Edenred",
  tokenflex: "Tokenflex",
  metropol: "Metropol",
  ticket: "Ticket",
  other: "Diğer",
  "": "Diğer",
};

const ZERO_METRIC: OverviewMetric = {
  revenue: 0,
  net: 0,
  orderCount: 0,
  avgBasket: 0,
  cancelledCount: 0,
};

const ZERO_TOTALS: ChannelTotals = { revenue: 0, orderCount: 0, net: 0 };
function totalsFrom(m: OverviewMetric): ChannelTotals {
  return { revenue: m.revenue, orderCount: m.orderCount, net: m.net };
}

function tyPeriod(p: DashboardPeriod): "today" | "week" | "month" {
  if (p === "day") return "today";
  if (p === "week") return "week";
  return "month";
}

function refDateFor(period: DashboardPeriod, dayOffset: number): number {
  if (dayOffset <= 0) return Date.now();
  const unitDays = period === "day" ? 1 : period === "week" ? 7 : 30;
  return Date.now() - dayOffset * unitDays * 24 * 60 * 60 * 1000;
}

function tyNet(ty: TrendyolDashboardStats): number {
  return ty.earnings?.totalBankNet ?? ty.finance?.netRevenue ?? 0;
}

function tyMetric(ty: TrendyolDashboardStats): OverviewMetric {
  const revenue = ty.revenue ?? 0;
  const orderCount = ty.orderCount ?? 0;
  return {
    revenue,
    net: tyNet(ty),
    orderCount,
    avgBasket: orderCount > 0 ? revenue / orderCount : 0,
    cancelledCount: ty.cancelledCount ?? 0,
  };
}

function mergeMetric(a: OverviewMetric, b: OverviewMetric): OverviewMetric {
  const revenue = a.revenue + b.revenue;
  const orderCount = a.orderCount + b.orderCount;
  return {
    revenue,
    net: a.net + b.net,
    orderCount,
    avgBasket: orderCount > 0 ? revenue / orderCount : 0,
    cancelledCount: a.cancelledCount + b.cancelledCount,
  };
}

function tyPaymentMap(items: { key: string; revenue: number }[]): Map<PaymentKey, number> {
  const map = new Map<PaymentKey, number>();
  for (const it of items) {
    const key = TY_PAYMENT_MAP[it.key] ?? "online";
    map.set(key, (map.get(key) ?? 0) + (it.revenue ?? 0));
  }
  return map;
}

// ─── Kanal kırılımı üreticileri ──────────────────────────────────────────────
function buildSplitTrend(
  manual: DashboardOverview | null,
  ty: TrendyolDashboardStats | null,
  period: DashboardPeriod,
): SplitTrendPoint[] {
  if (manual && period === "day") {
    const tmap = new Map<string, number>();
    for (const h of ty?.hourly ?? []) tmap.set(`${String(h.hour).padStart(2, "0")}:00`, h.revenue);
    return manual.trend.map((t) => ({ label: t.label, own: t.revenue, trendyol: tmap.get(t.label) ?? 0 }));
  }
  if (manual) return manual.trend.map((t) => ({ label: t.label, own: t.revenue, trendyol: 0 }));
  return (ty?.hourly ?? []).map((h) => ({
    label: `${String(h.hour).padStart(2, "0")}:00`,
    own: 0,
    trendyol: h.revenue,
  }));
}

function buildSplitProducts(
  manual: DashboardOverview | null,
  ty: TrendyolDashboardStats | null,
): SplitProduct[] {
  const map = new Map<string, { own: ChannelQty; trendyol: ChannelQty }>();
  for (const p of manual?.topProducts ?? []) {
    const e = map.get(p.name) ?? { own: { quantity: 0, revenue: 0 }, trendyol: { quantity: 0, revenue: 0 } };
    e.own.quantity += p.quantity;
    e.own.revenue += p.revenue;
    map.set(p.name, e);
  }
  for (const p of ty?.topProducts ?? []) {
    const e = map.get(p.name) ?? { own: { quantity: 0, revenue: 0 }, trendyol: { quantity: 0, revenue: 0 } };
    e.trendyol.quantity += p.quantity;
    e.trendyol.revenue += p.revenue;
    map.set(p.name, e);
  }
  return [...map.entries()]
    .map(([name, d]) => ({
      name,
      quantity: d.own.quantity + d.trendyol.quantity,
      revenue: d.own.revenue + d.trendyol.revenue,
      own: d.own,
      trendyol: d.trendyol,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6);
}

function buildSplitPayments(
  manual: DashboardOverview | null,
  ty: TrendyolDashboardStats | null,
): SplitPayment[] {
  const tym = tyPaymentMap(ty?.paymentBreakdown ?? []);
  const map = new Map<PaymentKey, { own: number; trendyol: number }>();
  for (const p of manual?.payments ?? []) {
    const e = map.get(p.key) ?? { own: 0, trendyol: 0 };
    e.own += p.amount;
    map.set(p.key, e);
  }
  for (const [key, amount] of tym.entries()) {
    const e = map.get(key) ?? { own: 0, trendyol: 0 };
    e.trendyol += amount;
    map.set(key, e);
  }
  return [...map.entries()]
    .map(([key, d]) => ({ key, label: PAYMENT_LABELS[key], amount: d.own + d.trendyol, own: d.own, trendyol: d.trendyol }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

// ─── Yemek kartı markası — Kendi (DB) ───────────────────────────────────────
async function ownMealCardBrands(
  period: DashboardPeriod,
  channel: Channel,
  dayOffset: number,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (channel === "trendyol") return map; // sadece Trendyol seçili → DB markası yok
  await connectDB();
  const w = periodWindows(period, dayOffset);
  const filter =
    channel === "all"
      ? {}
      : channel === "manual"
        ? { $or: [{ source: "manual" }, { source: { $exists: false } }] }
        : { source: channel };
  const rows = await OrderModel.find({
    ...filter,
    "payment.method": "meal_card",
    status: { $ne: "cancelled" },
    createdAt: { $gte: new Date(w.start), $lt: new Date(w.end) },
  })
    .select({ total: 1, "payment.mealCardBrand": 1 })
    .lean();
  for (const raw of rows) {
    const r = raw as unknown as { total: number; payment?: { mealCardBrand?: string } };
    const brand = (r.payment?.mealCardBrand ?? "other").toLowerCase() || "other";
    map.set(brand, (map.get(brand) ?? 0) + r.total);
  }
  return map;
}

function buildMealCardBrands(
  ownMap: Map<string, number>,
  ty: TrendyolDashboardStats | null,
): MealCardBrandRow[] {
  const tyMap = new Map<string, number>();
  for (const m of ty?.mealCardBreakdown ?? []) {
    const b = (m.brand ?? "other").toLowerCase() || "other";
    tyMap.set(b, (tyMap.get(b) ?? 0) + m.revenue);
  }
  const brands = new Set([...ownMap.keys(), ...tyMap.keys()]);
  return [...brands]
    .map((b) => ({
      brand: b,
      label: BRAND_LABELS[b] ?? b.charAt(0).toUpperCase() + b.slice(1),
      own: ownMap.get(b) ?? 0,
      trendyol: tyMap.get(b) ?? 0,
      amount: (ownMap.get(b) ?? 0) + (tyMap.get(b) ?? 0),
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function tyOps(ty: TrendyolDashboardStats | null): TrendyolOps {
  if (!ty || ty.error) return { available: false, orderCount: 0, delivered: 0, cancelled: 0 };
  return {
    available: true,
    orderCount: ty.orderCount ?? 0,
    delivered: ty.deliveredCount ?? 0,
    cancelled: ty.cancelledCount ?? 0,
  };
}

// ─── Base overview üreticileri ───────────────────────────────────────────────
function trendyolOverviewBase(
  ty: TrendyolDashboardStats,
  tyPrev: TrendyolDashboardStats | null,
  period: DashboardPeriod,
  dayOffset: number,
): KomutaOverviewBase {
  const m = tyMetric(ty);
  const splitProducts = buildSplitProducts(null, ty);
  const splitPayments = buildSplitPayments(null, ty);
  return {
    period,
    dayOffset,
    current: m,
    previous: tyPrev ? tyMetric(tyPrev) : ZERO_METRIC,
    trend: (ty.hourly ?? []).map((h) => ({
      label: `${String(h.hour).padStart(2, "0")}:00`,
      revenue: h.revenue,
      orders: h.orders,
    })),
    topProducts: splitProducts.slice(0, 5).map((p) => ({ name: p.name, quantity: p.quantity, revenue: p.revenue })),
    channels: [{ source: "trendyol", label: "Trendyol", revenue: m.revenue, orderCount: m.orderCount }],
    payments: splitPayments.map((p) => ({ key: p.key, label: p.label, amount: p.amount })),
    splitTrend: buildSplitTrend(null, ty, period),
    splitProducts,
    splitPayments,
    breakdown: { own: ZERO_TOTALS, trendyol: totalsFrom(m) },
  };
}

function manualOverviewBase(base: DashboardOverview): KomutaOverviewBase {
  return {
    ...base,
    splitTrend: buildSplitTrend(base, null, base.period),
    splitProducts: buildSplitProducts(base, null),
    splitPayments: buildSplitPayments(base, null),
    breakdown: { own: totalsFrom(base.current), trendyol: ZERO_TOTALS },
  };
}

function mergedOverviewBase(
  manual: DashboardOverview,
  ty: TrendyolDashboardStats,
  tyPrev: TrendyolDashboardStats | null,
  period: DashboardPeriod,
  dayOffset: number,
): KomutaOverviewBase {
  const m = tyMetric(ty);
  const current = mergeMetric(manual.current, m);
  const previous = mergeMetric(manual.previous, tyPrev ? tyMetric(tyPrev) : ZERO_METRIC);
  const splitProducts = buildSplitProducts(manual, ty);
  const splitPayments = buildSplitPayments(manual, ty);
  const channels = [
    ...manual.channels.filter((c) => c.source !== "trendyol"),
    { source: "trendyol" as OrderSource, label: "Trendyol", revenue: m.revenue, orderCount: m.orderCount },
  ].sort((a, b) => b.revenue - a.revenue);
  const splitTrend = buildSplitTrend(manual, ty, period);
  const trend = splitTrend.map((t) => ({ label: t.label, revenue: t.own + t.trendyol, orders: 0 }));
  return {
    period,
    dayOffset,
    current,
    previous,
    trend,
    topProducts: splitProducts.slice(0, 5).map((p) => ({ name: p.name, quantity: p.quantity, revenue: p.revenue })),
    channels,
    payments: splitPayments.map((p) => ({ key: p.key, label: p.label, amount: p.amount })),
    splitTrend,
    splitProducts,
    splitPayments,
    breakdown: { own: totalsFrom(manual.current), trendyol: totalsFrom(m) },
  };
}

export async function getKomutaOverview(
  period: DashboardPeriod = "day",
  channel: Channel = "all",
  dayOffset = 0,
): Promise<KomutaOverview> {
  // Trendyol dışı tek kanal.
  if (channel !== "all" && channel !== "trendyol") {
    const [base, ownMap] = await Promise.all([
      getDashboardOverview(period, channel, dayOffset).then(manualOverviewBase),
      ownMealCardBrands(period, channel, dayOffset),
    ]);
    return { ...base, mealCardBrands: buildMealCardBrands(ownMap, null), trendyolOps: tyOps(null) };
  }

  const tp = tyPeriod(period);
  const ref = refDateFor(period, dayOffset);
  const prevRef = refDateFor(period, dayOffset + 1); // delta için önceki eşit dönem

  if (channel === "trendyol") {
    const [ty, tyPrev] = await Promise.all([
      getTrendyolDashboardStats(tp, ref),
      getTrendyolDashboardStats(tp, prevRef),
    ]);
    const base = trendyolOverviewBase(ty, tyPrev, period, dayOffset);
    return {
      ...base,
      mealCardBrands: buildMealCardBrands(new Map(), ty),
      trendyolOps: tyOps(ty),
    };
  }

  // "Hepsi".
  const [manual, ty, tyPrev, ownMap] = await Promise.all([
    getDashboardOverview(period, "all", dayOffset),
    getTrendyolDashboardStats(tp, ref),
    getTrendyolDashboardStats(tp, prevRef),
    ownMealCardBrands(period, "all", dayOffset),
  ]);
  const base = mergedOverviewBase(manual, ty, tyPrev, period, dayOffset);
  return { ...base, mealCardBrands: buildMealCardBrands(ownMap, ty), trendyolOps: tyOps(ty) };
}

// ─── Birleşik sipariş listesi (KPI → siparişleri gör) ────────────────────────
function istHHMM(ms: number): string {
  const ist = new Date(ms + 3 * 60 * 60 * 1000);
  return `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
}

export interface OrdersFilter {
  method?: PaymentKey;
  productName?: string;
  district?: string;
  phone?: string; // kendi müşteri (telefon)
  trendyolId?: string; // Trendyol müşteri (grup id)
}

// Trendyol siparişlerini, çubuk kategorisiyle BİREBİR aynı eşlemeyle (ham anahtar
// → TY_PAYMENT_MAP) ve/veya ürün adıyla süzer. (Eski etiket-bazlı süzme "Online
// Kart" → yanlışlıkla "card" yapıyordu; bu yüzden Online'a tıklayınca gelmiyordu.)
function mapTyOrders(orders: TrendyolPeriodOrder[], f: OrdersFilter): KomutaOrderRow[] {
  return orders
    .filter((o) => {
      if (f.method && (TY_PAYMENT_MAP[o.paymentKey] ?? "online") !== f.method) return false;
      if (f.productName && !o.products.includes(f.productName)) return false;
      if (f.district && (o.district?.trim() || "") !== f.district) return false;
      // Müşteri: Trendyol'da grup id ile süz (telefon maskeli olabilir).
      if (f.trendyolId && (o.customerId ?? "") !== f.trendyolId) return false;
      // phone tek başına (trendyolId yokken) own müşteri demektir → TY hariç tut.
      if (f.phone && !f.trendyolId) return false;
      return true;
    })
    .map((o) => ({
      id: null,
      orderNumber: o.orderNumber,
      channel: "trendyol" as const,
      customerName: o.customerName || "Trendyol müşterisi",
      time: istHHMM(o.createdAt),
      total: o.total,
      net: 0,
      paymentLabel: o.paymentMethod,
      district: o.district?.trim() || null,
      status: o.status,
    }));
}

// Kendi (DB) kaynak filtresi (Trendyol dışı).
function ownSourceFilter(channel: Channel): Record<string, unknown> {
  return channel === "all"
    ? {}
    : channel === "manual"
      ? { $or: [{ source: "manual" }, { source: { $exists: false } }] }
      : { source: channel };
}

// Kendi (DB) — ürün ve/veya bölgeye göre siparişler.
async function ownFilteredOrders(
  period: DashboardPeriod,
  channel: Channel,
  dayOffset: number,
  f: OrdersFilter,
): Promise<KomutaOrderRow[]> {
  if (channel === "trendyol") return [];
  await connectDB();
  const w = periodWindows(period, dayOffset);
  const query: Record<string, unknown> = {
    ...ownSourceFilter(channel),
    ...(f.productName ? { "items.product.name": f.productName } : {}),
    ...(f.method ? { "payment.method": f.method } : {}),
    ...(f.phone ? { "customer.phone": { $regex: escapeRegex(f.phone) + "$" } } : {}),
    status: { $ne: "cancelled" },
    createdAt: { $gte: new Date(w.start), $lt: new Date(w.end) },
  };
  // Bölge filtresi: district eşleşir VEYA adres mahalle adını içerir.
  if (f.district) {
    const distOr = [
      { "customer.district": f.district },
      { "customer.address": { $regex: escapeRegex(f.district), $options: "i" } },
    ];
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: distOr }];
      delete query.$or;
    } else {
      query.$or = distOr;
    }
  }
  const rows = await OrderModel.find(query)
    .select({
      id: 1,
      orderNumber: 1,
      status: 1,
      total: 1,
      createdAt: 1,
      "customer.name": 1,
      "customer.district": 1,
      "payment.method": 1,
    })
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
  return rows.map((raw) => {
    const o = raw as unknown as {
      id: string;
      orderNumber: number;
      status: string;
      total: number;
      createdAt: Date | string;
      customer?: { name?: string; district?: string };
      payment?: { method?: PaymentKey };
    };
    const ms = o.createdAt instanceof Date ? o.createdAt.getTime() : new Date(o.createdAt).getTime();
    const method = o.payment?.method;
    return {
      id: o.id,
      orderNumber: String(o.orderNumber),
      channel: "own" as const,
      customerName: o.customer?.name ?? "—",
      time: istHHMM(ms),
      total: o.total,
      net: 0,
      paymentLabel: method ? PAYMENT_LABELS[method] ?? "—" : "—",
      district: (o.customer?.district ?? "").trim() || null,
      status: o.status,
    };
  });
}

export async function getKomutaPeriodOrders(
  period: DashboardPeriod = "day",
  channel: Channel = "all",
  dayOffset = 0,
  opts: OrdersFilter = {},
): Promise<KomutaOrderRow[]> {
  const wantOwn = channel !== "trendyol";
  const wantTy = channel === "all" || channel === "trendyol";

  const ownP: Promise<KomutaOrderRow[]> = !wantOwn
    ? Promise.resolve([])
    : opts.productName || opts.district || opts.phone
      ? ownFilteredOrders(period, channel, dayOffset, opts)
      : opts.trendyolId // sadece Trendyol müşterisi → kendi siparişi yok
        ? Promise.resolve([])
        : getPeriodOrders(period, channel === "all" ? "all" : channel, dayOffset, opts.method).then(
          (rows) =>
            rows.map((o) => ({
              id: o.id,
              orderNumber: String(o.orderNumber),
              channel: "own" as const,
              customerName: o.customerName,
              time: o.time,
              total: o.total,
              net: o.net,
              paymentLabel: o.paymentLabel,
              district: o.district,
              status: o.status,
            })),
        );
  const tyP = !wantTy
    ? Promise.resolve([] as TrendyolPeriodOrder[])
    : getTrendyolPeriodOrders(tyPeriod(period), refDateFor(period, dayOffset));

  const [own, tyOrders] = await Promise.all([ownP, tyP]);
  const ty = mapTyOrders(tyOrders, opts);

  return [...own, ...ty].sort((a, b) => b.time.localeCompare(a.time));
}

// ─── Operasyon: bölge dağılımı + saat bazlı yoğunluk (kanal kırılımlı) ────────
function istHour(ms: number): number {
  return new Date(ms + 3 * 60 * 60 * 1000).getUTCHours();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Adres metninden mahalle çıkarır ("Atatürk Mah. 5. Sok" → "Atatürk").
// Kendi siparişlerinde district boş olabilir (pin atılıyor) ama adres dolu;
// kullanıcının yazdığı adresten bölgeyi türetiriz (reverse-geocode yok).
function extractNeighborhood(address: string | undefined): string | null {
  if (!address) return null;
  const tokens = address.split(/[\s,]+/).filter(Boolean);
  const idx = tokens.findIndex((t) => /^(mah|mahalle|mahallesi|mh)\.?$/i.test(t));
  if (idx <= 0) return null;
  const before: string[] = [];
  for (let i = idx - 1; i >= 0 && before.length < 3; i--) {
    const t = tokens[i];
    if (/\d/.test(t) || !/[a-zçğıöşü]/i.test(t)) break;
    before.unshift(t);
  }
  return before.length ? before.join(" ") : null;
}

// Bir siparişin bölge adı: önce district, yoksa adresten mahalle.
function ownRegionName(o: { customer?: { district?: string; address?: string } }): string | null {
  const d = (o.customer?.district ?? "").trim();
  if (d) return d;
  return extractNeighborhood(o.customer?.address);
}

export interface KomutaRegionRow {
  name: string;
  own: number;
  trendyol: number;
  total: number;
}
export interface KomutaHourRow {
  hour: number;
  own: number;
  trendyol: number;
}
export interface KomutaOperations {
  regions: KomutaRegionRow[];
  hourly: KomutaHourRow[];
}

export async function getKomutaOperations(
  period: DashboardPeriod = "day",
  channel: Channel = "all",
  dayOffset = 0,
): Promise<KomutaOperations> {
  const wantOwn = channel !== "trendyol";
  const wantTy = channel === "all" || channel === "trendyol";

  const ownP = wantOwn
    ? (async () => {
        await connectDB();
        const w = periodWindows(period, dayOffset);
        return OrderModel.find({
          ...ownSourceFilter(channel),
          status: { $ne: "cancelled" },
          createdAt: { $gte: new Date(w.start), $lt: new Date(w.end) },
        })
          .select({ createdAt: 1, "customer.district": 1, "customer.address": 1 })
          .lean();
      })()
    : Promise.resolve([] as unknown[]);
  const tyP = wantTy
    ? getTrendyolPeriodOrders(tyPeriod(period), refDateFor(period, dayOffset))
    : Promise.resolve([] as TrendyolPeriodOrder[]);

  const [ownRows, tyOrders] = await Promise.all([ownP, tyP]);

  const regionMap = new Map<string, { own: number; trendyol: number }>();
  const hourMap = new Map<number, { own: number; trendyol: number }>();
  const bumpRegion = (name: string, ch: "own" | "trendyol") => {
    const e = regionMap.get(name) ?? { own: 0, trendyol: 0 };
    e[ch]++;
    regionMap.set(name, e);
  };
  const bumpHour = (h: number, ch: "own" | "trendyol") => {
    const e = hourMap.get(h) ?? { own: 0, trendyol: 0 };
    e[ch]++;
    hourMap.set(h, e);
  };

  // Bölge adı çıkmayan (district boş + adreste mahalle yok) siparişler düşmesin;
  // toplam gerçek sayıya eşit kalsın diye "Belirtilmemiş" kovasına yazılır.
  const UNKNOWN = "Belirtilmemiş";
  for (const raw of ownRows) {
    const o = raw as { createdAt: Date | string; customer?: { district?: string; address?: string } };
    const ms = o.createdAt instanceof Date ? o.createdAt.getTime() : new Date(o.createdAt).getTime();
    bumpHour(istHour(ms), "own");
    bumpRegion(ownRegionName(o) ?? UNKNOWN, "own");
  }
  for (const o of tyOrders) {
    if (o.status.toLowerCase().includes("cancel")) continue;
    bumpHour(istHour(o.createdAt), "trendyol");
    const d = (o.district ?? "").trim();
    bumpRegion(d || UNKNOWN, "trendyol");
  }

  const regions = [...regionMap.entries()]
    .map(([name, v]) => ({ name, own: v.own, trendyol: v.trendyol, total: v.own + v.trendyol }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const hours = [...hourMap.keys()];
  const minH = hours.length ? Math.min(...hours) : 10;
  const maxH = hours.length ? Math.max(...hours) : 22;
  const hourly: KomutaHourRow[] = [];
  for (let h = minH; h <= maxH; h++) {
    const e = hourMap.get(h) ?? { own: 0, trendyol: 0 };
    hourly.push({ hour: h, own: e.own, trendyol: e.trendyol });
  }

  return { regions, hourly };
}

// ─── Müşteri: kendi + Trendyol birleşik (telefonla eşleştirme) ───────────────
function normPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  if (!d) return null;
  return d.length >= 10 ? d.slice(-10) : d;
}

export interface KomutaCustomerRow {
  name: string;
  phone: string | null; // kendi sipariş drill-down anahtarı
  trendyolId: string | null; // Trendyol sipariş drill-down anahtarı
  own: { revenue: number; orders: number };
  trendyol: { revenue: number; orders: number };
  total: number;
}
export interface KomutaCustomers {
  segments: { onlyOwn: number; onlyTrendyol: number; both: number };
  topCustomers: KomutaCustomerRow[];
}

type CustAgg = {
  name: string;
  phone: string | null;
  trendyolId: string | null;
  own: { revenue: number; orders: number };
  trendyol: { revenue: number; orders: number };
};

// Kendi müşterileri telefonla, Trendyol müşterileri grup id ile gruplanır
// (Trendyol telefonu maskeli/proxy olabilir). Kesişim ("Her İki Kanal") yalnız
// gerçek telefonlar eşleşince oluşur.
export async function getKomutaCustomers(
  period: DashboardPeriod = "day",
  channel: Channel = "all",
  dayOffset = 0,
): Promise<KomutaCustomers> {
  const wantOwn = channel !== "trendyol";
  const wantTy = channel === "all" || channel === "trendyol";

  const ownP = wantOwn
    ? (async () => {
        await connectDB();
        const w = periodWindows(period, dayOffset);
        return OrderModel.find({
          ...ownSourceFilter(channel),
          status: { $ne: "cancelled" },
          createdAt: { $gte: new Date(w.start), $lt: new Date(w.end) },
        })
          .select({ total: 1, "customer.name": 1, "customer.phone": 1 })
          .lean();
      })()
    : Promise.resolve([] as unknown[]);
  const tyP = wantTy
    ? getTrendyolPeriodOrders(tyPeriod(period), refDateFor(period, dayOffset))
    : Promise.resolve([] as TrendyolPeriodOrder[]);

  const [ownRows, tyOrders] = await Promise.all([ownP, tyP]);

  // Kendi: telefon anahtarı.
  const rows: CustAgg[] = [];
  const byPhone = new Map<string, CustAgg>();
  for (const raw of ownRows) {
    const o = raw as { total: number; customer?: { name?: string; phone?: string } };
    const phone = normPhone(o.customer?.phone);
    if (!phone) continue;
    let e = byPhone.get(phone);
    if (!e) {
      e = {
        name: o.customer?.name ?? "—",
        phone,
        trendyolId: null,
        own: { revenue: 0, orders: 0 },
        trendyol: { revenue: 0, orders: 0 },
      };
      byPhone.set(phone, e);
      rows.push(e);
    }
    e.own.revenue += o.total;
    e.own.orders++;
  }

  // Trendyol: müşteri id anahtarı; telefon own ile eşleşirse o satıra eklenir.
  const byTyKey = new Map<string, CustAgg>();
  for (const o of tyOrders) {
    if (o.status.toLowerCase().includes("cancel")) continue;
    const tyKey = o.customerId
      ? `id:${o.customerId}`
      : o.customerName
        ? `name:${o.customerName.toLowerCase()}`
        : null;
    if (!tyKey) continue;
    let e = byTyKey.get(tyKey);
    if (!e) {
      const phone = normPhone(o.customerPhone);
      const matched = phone ? byPhone.get(phone) : undefined; // own müşteriyle eşleşti mi
      if (matched) {
        e = matched;
        e.trendyolId = o.customerId ?? e.trendyolId;
      } else {
        e = {
          name: o.customerName || "—",
          phone: null,
          trendyolId: o.customerId,
          own: { revenue: 0, orders: 0 },
          trendyol: { revenue: 0, orders: 0 },
        };
        rows.push(e);
      }
      byTyKey.set(tyKey, e);
    }
    e.trendyol.revenue += o.total;
    e.trendyol.orders++;
  }

  let onlyOwn = 0;
  let onlyTrendyol = 0;
  let both = 0;
  for (const e of rows) {
    const ownHas = e.own.orders > 0;
    const tyHas = e.trendyol.orders > 0;
    if (ownHas && tyHas) both++;
    else if (ownHas) onlyOwn++;
    else onlyTrendyol++;
  }

  const topCustomers: KomutaCustomerRow[] = rows
    .map((e) => ({
      name: e.name,
      phone: e.phone,
      trendyolId: e.trendyolId,
      own: e.own,
      trendyol: e.trendyol,
      total: e.own.revenue + e.trendyol.revenue,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  return { segments: { onlyOwn, onlyTrendyol, both }, topCustomers };
}
