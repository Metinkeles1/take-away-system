"use server";

// Trendyol satış ve müşteri analitik aksiyonları. /packages endpoint'inden
// daha geniş bir pencerede paketleri çekip iki perspektifte özetler:
// - Satış analitiği: günlük trend, gün×saat ısı haritası, top ürün ve kategori
// - Müşteri analitiği: tekrar oranı, frekans dağılımı, top müşteriler
//
// Cache mantığı dashboard ile aynı: bugünü içeren period 60sn, geçmiş 10dk.

import { unstable_cache } from "next/cache";
import {
  listTrendyolPackages,
  type TrendyolPackage,
} from "@/lib/integrations/trendyol/client";
import { istanbulDayStart } from "@/lib/datetime";

// Ödeme tipi normalizasyonu — trendyolDashboard.ts'taki paymentKey ile uyumlu.
function paymentKey(p: TrendyolPackage): string {
  const t = p.payment?.paymentType;
  if (t === "PAY_WITH_CARD") return "online";
  if (t === "PAY_WITH_MEAL_CARD") return "meal_card";
  if (t === "PAY_WITH_ON_DELIVERY") {
    const sub = p.payment?.onDelivery?.paymentType?.toUpperCase();
    if (sub === "CARD") return "card";
    return "cash";
  }
  return "online";
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kredi Kartı",
  online: "Online",
  meal_card: "Yemek Kartı",
};

export type AnalyticsPeriod = "week" | "month" | "quarter";

const PERIOD_DAYS: Record<AnalyticsPeriod, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

const NON_REVENUE_STATUSES = new Set(["Cancelled", "UnSupplied"]);
const API_BUFFER_MS = 14 * 24 * 60 * 60 * 1000;

function periodRange(period: AnalyticsPeriod): { start: number; end: number } {
  const end = Date.now();
  // Istanbul gününe göre normalize — Vercel UTC kayması olmasın.
  const startOfToday = istanbulDayStart();
  const start = new Date(startOfToday);
  start.setDate(start.getDate() - (PERIOD_DAYS[period] - 1));
  return { start: start.getTime(), end };
}

async function fetchAllPackages(
  start: number,
  end: number,
): Promise<{ ok: true; packages: TrendyolPackage[] } | { ok: false; error: string }> {
  const size = 50;
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

function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
  });
}

// ─── Sales analytics ──────────────────────────────────────────────

export interface SalesAnalytics {
  period: AnalyticsPeriod;
  rangeStart: number;
  rangeEnd: number;
  totalOrders: number;
  totalRevenue: number;
  avgBasket: number;
  cancelRate: number;
  daily: { dateKey: string; label: string; orders: number; revenue: number; cancelled: number }[];
  heatmap: { dow: number; hour: number; orders: number }[]; // 7*24 = 168
  topProducts: { name: string; quantity: number; revenue: number }[];
  lowSellers: { name: string; quantity: number; revenue: number }[];
  bestDay: { label: string; orders: number; revenue: number } | null;
  bestHour: { hour: number; orders: number } | null;
  error?: string;
}

async function computeSalesAnalytics(period: AnalyticsPeriod): Promise<SalesAnalytics> {
  const { start, end } = periodRange(period);
  const apiStart = start - API_BUFFER_MS;

  const res = await fetchAllPackages(apiStart, end);
  if (!res.ok) {
    return emptySales(period, start, end, res.error);
  }

  const packages = res.packages.filter(
    (p) => p.packageCreationDate >= start && p.packageCreationDate <= end,
  );
  const completed = packages.filter((p) => !NON_REVENUE_STATUSES.has(p.packageStatus));
  const cancelled = packages.filter((p) => NON_REVENUE_STATUSES.has(p.packageStatus));

  const totalRevenue = completed.reduce((s, p) => s + (p.totalPrice ?? 0), 0);
  const totalOrders = completed.length;
  const avgBasket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const cancelRate = packages.length > 0 ? cancelled.length / packages.length : 0;

  // Daily buckets (her gün için bir bucket, sıfırlar dahil)
  const days = PERIOD_DAYS[period];
  const dailyMap = new Map<string, { orders: number; revenue: number; cancelled: number; ts: number }>();
  const startOfStart = new Date(start);
  for (let i = 0; i < days; i++) {
    const d = new Date(startOfStart);
    d.setDate(d.getDate() + i);
    dailyMap.set(dayKey(d.getTime()), {
      orders: 0,
      revenue: 0,
      cancelled: 0,
      ts: d.getTime(),
    });
  }
  for (const p of completed) {
    const k = dayKey(p.packageCreationDate);
    const cur = dailyMap.get(k);
    if (cur) {
      cur.orders++;
      cur.revenue += p.totalPrice ?? 0;
    }
  }
  for (const p of cancelled) {
    const k = dayKey(p.packageCreationDate);
    const cur = dailyMap.get(k);
    if (cur) cur.cancelled++;
  }
  const daily = [...dailyMap.entries()]
    .sort((a, b) => a[1].ts - b[1].ts)
    .map(([k, v]) => ({
      dateKey: k,
      label: dayLabel(v.ts),
      orders: v.orders,
      revenue: v.revenue,
      cancelled: v.cancelled,
    }));

  // Heatmap 7×24
  const heatBuckets = new Map<string, number>();
  for (const p of completed) {
    const d = new Date(p.packageCreationDate);
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    const hour = d.getHours();
    const key = `${dow}-${hour}`;
    heatBuckets.set(key, (heatBuckets.get(key) ?? 0) + 1);
  }
  const heatmap: SalesAnalytics["heatmap"] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmap.push({ dow, hour, orders: heatBuckets.get(`${dow}-${hour}`) ?? 0 });
    }
  }

  // Top ürünler
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
  const allProducts = [...productMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
  const topProducts = allProducts.slice(0, 10);
  // En az satanlar: satışı olan ama düşük adetli ürünler. Hiç satılmayan menü
  // ürünleri bu sette yok (packages.lines'da görünmüyorlar); Menü sayfasında
  // ayrı incele.
  const lowSellers = [...allProducts]
    .sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue)
    .slice(0, 10);

  const bestDayEntry = [...daily].sort((a, b) => b.revenue - a.revenue)[0];
  const bestDay = bestDayEntry && bestDayEntry.revenue > 0
    ? { label: bestDayEntry.label, orders: bestDayEntry.orders, revenue: bestDayEntry.revenue }
    : null;

  const hourTotals = new Map<number, number>();
  for (const cell of heatmap) {
    hourTotals.set(cell.hour, (hourTotals.get(cell.hour) ?? 0) + cell.orders);
  }
  const bestHourEntry = [...hourTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const bestHour = bestHourEntry && bestHourEntry[1] > 0
    ? { hour: bestHourEntry[0], orders: bestHourEntry[1] }
    : null;

  return {
    period,
    rangeStart: start,
    rangeEnd: end,
    totalOrders,
    totalRevenue,
    avgBasket,
    cancelRate,
    daily,
    heatmap,
    topProducts,
    lowSellers,
    bestDay,
    bestHour,
  };
}

function emptySales(
  period: AnalyticsPeriod,
  start: number,
  end: number,
  error?: string,
): SalesAnalytics {
  return {
    period,
    rangeStart: start,
    rangeEnd: end,
    totalOrders: 0,
    totalRevenue: 0,
    avgBasket: 0,
    cancelRate: 0,
    daily: [],
    heatmap: [],
    topProducts: [],
    lowSellers: [],
    bestDay: null,
    bestHour: null,
    error,
  };
}

const cachedSales = unstable_cache(
  async (period: AnalyticsPeriod) => computeSalesAnalytics(period),
  ["trendyol-sales-analytics"],
  { revalidate: 60 },
);

export async function getTrendyolSalesAnalytics(
  period: AnalyticsPeriod = "month",
): Promise<SalesAnalytics> {
  return cachedSales(period);
}

// ─── Customer analytics ───────────────────────────────────────────

export interface CustomerAnalytics {
  period: AnalyticsPeriod;
  rangeStart: number;
  rangeEnd: number;
  totalOrders: number;
  totalRevenue: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  newCustomers: number;
  repeatRate: number;
  avgOrdersPerCustomer: number;
  avgRevenuePerCustomer: number;
  topCustomers: TopCustomer[];
  frequencyBuckets: { label: string; customers: number; pct: number }[];
  error?: string;
}

export interface TopCustomer {
  id: string;
  name: string;
  phone?: string;
  district?: string;
  neighborhood?: string;
  addressLine?: string;
  orderCount: number;
  revenue: number;
  lastOrderAt: number;
  avgBasket: number;
  preferredPayment?: string; // PAYMENT_LABEL key
  recentOrders: {
    orderNumber: string;
    createdAt: number;
    total: number;
    status: string;
  }[];
}

async function computeCustomerAnalytics(period: AnalyticsPeriod): Promise<CustomerAnalytics> {
  const { start, end } = periodRange(period);
  const apiStart = start - API_BUFFER_MS;

  const res = await fetchAllPackages(apiStart, end);
  if (!res.ok) {
    return emptyCustomer(period, start, end, res.error);
  }

  const completed = res.packages.filter(
    (p) =>
      p.packageCreationDate >= start &&
      p.packageCreationDate <= end &&
      !NON_REVENUE_STATUSES.has(p.packageStatus),
  );

  // Müşteri identifier: önce customer.id, yoksa firstName+lastName combo.
  type CustomerAcc = {
    id: string;
    name: string;
    phone?: string;
    district?: string;
    neighborhood?: string;
    addressLine?: string;
    orderCount: number;
    revenue: number;
    lastOrderAt: number;
    paymentCounts: Map<string, number>;
    recentOrders: TopCustomer["recentOrders"];
  };
  const byCustomer = new Map<string, CustomerAcc>();
  for (const p of completed) {
    const idRaw = p.customer?.id;
    const fn = p.customer?.firstName?.trim() ?? "";
    const ln = p.customer?.lastName?.trim() ?? "";
    const name = [fn, ln].filter(Boolean).join(" ");
    const key = idRaw != null ? `id:${idRaw}` : name ? `name:${name.toLowerCase()}` : null;
    if (!key) continue;
    const cur: CustomerAcc = byCustomer.get(key) ?? {
      id: key,
      name: name || "—",
      orderCount: 0,
      revenue: 0,
      lastOrderAt: 0,
      paymentCounts: new Map<string, number>(),
      recentOrders: [],
    };
    cur.orderCount++;
    cur.revenue += p.totalPrice ?? 0;
    cur.lastOrderAt = Math.max(cur.lastOrderAt, p.packageCreationDate);
    if (!cur.name || cur.name === "—") cur.name = name || "—";

    // İletişim/adres — ilk geldiğinde sakla (sonradan boşaltma riski yok)
    if (p.address?.phone && !cur.phone) cur.phone = p.address.phone;
    if (p.address?.district && !cur.district) cur.district = p.address.district;
    if (p.address?.neighborhood && !cur.neighborhood) cur.neighborhood = p.address.neighborhood;
    if (!cur.addressLine) {
      const parts = [p.address?.address1, p.address?.address2].filter(Boolean);
      if (parts.length) cur.addressLine = parts.join(" ");
    }

    // Ödeme tercihi sayacı
    const pkey = paymentKey(p);
    cur.paymentCounts.set(pkey, (cur.paymentCounts.get(pkey) ?? 0) + 1);

    cur.recentOrders.push({
      orderNumber: p.orderNumber,
      createdAt: p.packageCreationDate,
      total: p.totalPrice ?? 0,
      status: p.packageStatus,
    });

    byCustomer.set(key, cur);
  }

  const customers = [...byCustomer.values()];
  const uniqueCustomers = customers.length;
  const repeatCustomers = customers.filter((c) => c.orderCount >= 2).length;
  const newCustomers = customers.filter((c) => c.orderCount === 1).length;
  const totalOrders = completed.length;
  const totalRevenue = completed.reduce((s, p) => s + (p.totalPrice ?? 0), 0);
  const repeatRate = uniqueCustomers > 0 ? repeatCustomers / uniqueCustomers : 0;
  const avgOrdersPerCustomer = uniqueCustomers > 0 ? totalOrders / uniqueCustomers : 0;
  const avgRevenuePerCustomer = uniqueCustomers > 0 ? totalRevenue / uniqueCustomers : 0;

  const topCustomers: TopCustomer[] = [...customers]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((c) => {
      const topPay = [...c.paymentCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const recent = [...c.recentOrders]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        district: c.district,
        neighborhood: c.neighborhood,
        addressLine: c.addressLine,
        orderCount: c.orderCount,
        revenue: c.revenue,
        lastOrderAt: c.lastOrderAt,
        avgBasket: c.orderCount > 0 ? c.revenue / c.orderCount : 0,
        preferredPayment: topPay ? PAYMENT_LABEL[topPay[0]] : undefined,
        recentOrders: recent,
      };
    });

  const buckets: Record<string, number> = {
    "1 sipariş":   0,
    "2 sipariş":   0,
    "3-5 sipariş": 0,
    "6+ sipariş":  0,
  };
  for (const c of customers) {
    if (c.orderCount === 1) buckets["1 sipariş"]++;
    else if (c.orderCount === 2) buckets["2 sipariş"]++;
    else if (c.orderCount <= 5) buckets["3-5 sipariş"]++;
    else buckets["6+ sipariş"]++;
  }
  const totalForPct = uniqueCustomers || 1;
  const frequencyBuckets = Object.entries(buckets).map(([label, count]) => ({
    label,
    customers: count,
    pct: (count / totalForPct) * 100,
  }));

  return {
    period,
    rangeStart: start,
    rangeEnd: end,
    totalOrders,
    totalRevenue,
    uniqueCustomers,
    repeatCustomers,
    newCustomers,
    repeatRate,
    avgOrdersPerCustomer,
    avgRevenuePerCustomer,
    topCustomers,
    frequencyBuckets,
  };
}

function emptyCustomer(
  period: AnalyticsPeriod,
  start: number,
  end: number,
  error?: string,
): CustomerAnalytics {
  return {
    period,
    rangeStart: start,
    rangeEnd: end,
    totalOrders: 0,
    totalRevenue: 0,
    uniqueCustomers: 0,
    repeatCustomers: 0,
    newCustomers: 0,
    repeatRate: 0,
    avgOrdersPerCustomer: 0,
    avgRevenuePerCustomer: 0,
    topCustomers: [],
    frequencyBuckets: [],
    error,
  };
}

const cachedCustomer = unstable_cache(
  async (period: AnalyticsPeriod) => computeCustomerAnalytics(period),
  ["trendyol-customer-analytics"],
  { revalidate: 60 },
);

export async function getTrendyolCustomerAnalytics(
  period: AnalyticsPeriod = "month",
): Promise<CustomerAnalytics> {
  return cachedCustomer(period);
}
