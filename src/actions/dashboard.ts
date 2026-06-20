"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import CustomerModel from "@/models/Customer";
import ProductModel from "@/models/Product";
import { type OrderSource } from "@/types";
import {
  istanbulDateISO,
  istanbulDayStart,
  istanbulDayStartDaysAgo,
} from "@/lib/datetime";
import { estimateOrderNet } from "@/lib/commission";
import { slaLevel, type SlaLevel } from "@/lib/operations";

// "all" = filtre yok; OrderSource = sadece o kaynak.
// "manual" filtresi eski (source alanı olmayan) kayıtları da kapsar.
export type DashboardSource = "all" | OrderSource;

function buildSourceFilter(source: DashboardSource): Record<string, unknown> {
  if (source === "all") return {};
  if (source === "manual") {
    return { $or: [{ source: "manual" }, { source: { $exists: false } }] };
  }
  return { source };
}

// ─── Dashboard veri tipleri ────────────────────────────────────────────────
export interface DashboardStats {
  todayOrderCount: number;
  todayRevenue: number;
  todayNet: number; // bugünkü tahmini net (komisyon sonrası) — bkz. lib/commission
  activeOrderCount: number;
  totalOrderCount: number;
  totalRevenue: number;
  totalCustomerCount: number;
  totalProductCount: number;

  paymentBreakdown: {
    cash: number;
    card: number;
    online: number;
    meal_card: number;
    iban: number;
  };
  paymentBreakdownAll: {
    cash: number;
    card: number;
    online: number;
    meal_card: number;
    iban: number;
  };

  topProducts: { name: string; quantity: number; revenue: number }[];
  categoryBreakdown: { category: string; label: string; quantity: number; revenue: number }[];
  dailyTrend: { date: string; orders: number; revenue: number }[];
  statusBreakdown: Record<string, number>;

  activeOrders: {
    id: string;
    orderNumber: number;
    customerName: string;
    total: number;
    status: string;
    createdAt: Date;
  }[];

  recentOrders: {
    id: string;
    orderNumber: number;
    customerName: string;
    total: number;
    status: string;
    paymentMethod: string;
    createdAt: Date;
  }[];

  topAddresses: {
    address: string;
    orderCount: number;
    revenue: number;
  }[];

  menuPreferences: {
    name: string;
    category: string;
    categoryLabel: string;
    quantity: number;
    revenue: number;
    orderCount: number;
  }[];

  hourlyDistribution: { hour: number; count: number; revenue: number }[];
  revenueTrend: { date: string; orders: number; revenue: number }[];

  monthlyTrend: {
    month: string;
    label: string;
    orders: number;
    revenue: number;
    target: number;
    customers: number;
  }[];

  regionBreakdown: {
    district: string;
    orderCount: number;
    revenue: number;
    avgBasket: number;
  }[];

  // Müşteri kohortları — telefon bazlı ilk/son sipariş tarihinden türetilir.
  customerCohorts: {
    total: number; // telefonu olan benzersiz müşteri
    newThisMonth: number; // ilk siparişi bu ay
    returningThisMonth: number; // bu ay sipariş + öncesinde de var
    repeatRate: number; // 2+ siparişli müşteri oranı (%)
    oneTime: number; // tek siparişlik
    atRisk: number; // son sipariş 30-90 gün önce (soğuyor)
    lost: number; // son sipariş 90+ gün önce
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  kebap: "Kebap",
  pide: "Pide",
  lahmacun: "Lahmacun",
  durum: "Dürüm",
  kilo: "Kilo İşi",
  corba: "Çorba",
  tatli: "Tatlı",
  icecek: "İçecek",
};

const MONTH_LABELS = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

type PaymentKey = "cash" | "card" | "online" | "meal_card" | "iban";

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

// Tek seferlik string padding cache (en sık 1-12 ay/gün için)
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export async function getDashboardStats(
  source: DashboardSource = "all",
): Promise<DashboardStats> {
  await connectDB();

  const todayStart = istanbulDayStart();
  const todayStartMs = todayStart.getTime();
  const sevenDaysAgoMs = istanbulDayStartDaysAgo(6).getTime();
  const ninetyDaysAgoMs = istanbulDayStartDaysAgo(89).getTime();
  const activeMaxAgeStartMs = Date.now() - 48 * 60 * 60 * 1000;

  // Sadece ihtiyacımız olan alanları al (network + memory tasarrufu)
  const [allOrders, totalCustomerCount, totalProductCount] = await Promise.all([
    OrderModel.find(buildSourceFilter(source))
      .select({
        id: 1,
        orderNumber: 1,
        status: 1,
        total: 1,
        source: 1,
        createdAt: 1,
        "customer.name": 1,
        "customer.phone": 1,
        "customer.address": 1,
        "customer.district": 1,
        "payment.method": 1,
        "items.quantity": 1,
        "items.totalPrice": 1,
        "items.product.name": 1,
        "items.product.category": 1,
      })
      .sort({ createdAt: -1 })
      .lean(),
    CustomerModel.countDocuments(),
    ProductModel.countDocuments(),
  ]);

  // ─── Önceden bucket'ları hazırla — O(1) lookup ───────────────
  const dailyMap = new Map<string, { orders: number; revenue: number }>();
  const dailyOrder: string[] = []; // sıralı 90 anahtar
  for (let i = 89; i >= 0; i--) {
    const date = new Date(todayStartMs - i * 24 * 60 * 60 * 1000);
    // Istanbul "günü" zaten todayStart'tan üretildiği için ISO tarihini direkt al
    const ist = new Date(date.getTime() + ISTANBUL_OFFSET_MS);
    const key = `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}-${pad2(ist.getUTCDate())}`;
    dailyMap.set(key, { orders: 0, revenue: 0 });
    dailyOrder.push(key);
  }

  const monthlyMap = new Map<
    string,
    { label: string; orders: number; revenue: number; customers: Set<string> }
  >();
  const monthlyOrder: string[] = [];
  const istNow = new Date(Date.now() + ISTANBUL_OFFSET_MS);
  const currentY = istNow.getUTCFullYear();
  const currentM = istNow.getUTCMonth();
  for (let i = 11; i >= 0; i--) {
    const y = currentY + Math.floor((currentM - i) / 12);
    const m = ((currentM - i) % 12 + 12) % 12;
    const key = `${y}-${pad2(m + 1)}`;
    monthlyMap.set(key, {
      label: MONTH_LABELS[m],
      orders: 0,
      revenue: 0,
      customers: new Set<string>(),
    });
    monthlyOrder.push(key);
  }

  const hourBuckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    revenue: 0,
  }));

  const paymentBreakdown: Record<PaymentKey, number> = {
    cash: 0, card: 0, online: 0, meal_card: 0, iban: 0,
  };
  const paymentBreakdownAll: Record<PaymentKey, number> = {
    cash: 0, card: 0, online: 0, meal_card: 0, iban: 0,
  };

  const productMap = new Map<string, { quantity: number; revenue: number }>();
  const catMap = new Map<string, { quantity: number; revenue: number }>();
  const menuPrefMap = new Map<
    string,
    { category: string; quantity: number; revenue: number; orderIds: Set<string> }
  >();
  const addressMap = new Map<string, { orderCount: number; revenue: number }>();
  const regionMap = new Map<string, { orderCount: number; revenue: number }>();
  // Telefon → { ilk sipariş, son sipariş, adet } — müşteri kohortları için.
  const phoneMap = new Map<
    string,
    { firstMs: number; lastMs: number; count: number }
  >();
  const statusBreakdown: Record<string, number> = {};

  let totalOrderCount = 0;
  let totalRevenue = 0;
  let todayOrderCount = 0;
  let todayRevenue = 0;
  let todayNet = 0;
  let activeOrderCount = 0;

  const activeOrders: DashboardStats["activeOrders"] = [];

  // ─── Tek geçiş ───────────────────────────────────────────────
  for (const o of allOrders) {
    const status = o.status as string;
    statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;

    if (status === "cancelled") continue;

    const createdAt = (o as unknown as { createdAt: Date }).createdAt;
    const dateMs =
      createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();

    totalOrderCount++;
    totalRevenue += o.total;

    const isToday = dateMs >= todayStartMs;

    const method = o.payment?.method as PaymentKey | undefined;
    if (method && method in paymentBreakdownAll) {
      paymentBreakdownAll[method] += o.total;
    }

    // Ürün / kategori / menü tercihleri — items üzerinden tek tarama
    for (const item of o.items) {
      const name = item.product.name;
      const cat = item.product.category;
      const qty = item.quantity;
      const rev = item.totalPrice;

      const p = productMap.get(name);
      if (p) {
        p.quantity += qty;
        p.revenue += rev;
      } else {
        productMap.set(name, { quantity: qty, revenue: rev });
      }

      const c = catMap.get(cat);
      if (c) {
        c.quantity += qty;
        c.revenue += rev;
      } else {
        catMap.set(cat, { quantity: qty, revenue: rev });
      }

      const mp = menuPrefMap.get(name);
      if (mp) {
        mp.quantity += qty;
        mp.revenue += rev;
        mp.orderIds.add(o.id);
      } else {
        menuPrefMap.set(name, {
          category: cat,
          quantity: qty,
          revenue: rev,
          orderIds: new Set([o.id]),
        });
      }
    }

    // Adres
    const addr = (o.customer.address ?? "").trim();
    if (addr) {
      const a = addressMap.get(addr);
      if (a) {
        a.orderCount++;
        a.revenue += o.total;
      } else {
        addressMap.set(addr, { orderCount: 1, revenue: o.total });
      }
    }

    // Müşteri kohortu (telefon bazlı ilk/son sipariş)
    const phone = (o.customer as unknown as { phone?: string }).phone;
    if (phone) {
      const pm = phoneMap.get(phone);
      if (pm) {
        pm.count++;
        if (dateMs < pm.firstMs) pm.firstMs = dateMs;
        if (dateMs > pm.lastMs) pm.lastMs = dateMs;
      } else {
        phoneMap.set(phone, { firstMs: dateMs, lastMs: dateMs, count: 1 });
      }
    }

    // Bölge
    const district = (
      (o.customer as unknown as { district?: string }).district ?? ""
    ).trim();
    if (district) {
      const r = regionMap.get(district);
      if (r) {
        r.orderCount++;
        r.revenue += o.total;
      } else {
        regionMap.set(district, { orderCount: 1, revenue: o.total });
      }
    }

    // Bugün
    if (isToday) {
      todayOrderCount++;
      todayRevenue += o.total;
      const orderSource = (o as unknown as { source?: OrderSource }).source;
      todayNet += estimateOrderNet(o.total, orderSource, method === "meal_card");
      if (method && method in paymentBreakdown) {
        paymentBreakdown[method] += o.total;
      }
    }

    // Aktif (48s + open status)
    if (
      dateMs >= activeMaxAgeStartMs &&
      (status === "pending" || status === "preparing" || status === "on-the-way")
    ) {
      activeOrderCount++;
      if (activeOrders.length < 10) {
        activeOrders.push({
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customer.name,
          total: o.total,
          status,
          createdAt,
        });
      }
    }

    // Istanbul saatine bir kere çevir
    const istMs = dateMs + ISTANBUL_OFFSET_MS;
    const istDate = new Date(istMs);

    // Aylık bucket
    const monthKey = `${istDate.getUTCFullYear()}-${pad2(istDate.getUTCMonth() + 1)}`;
    const monthBucket = monthlyMap.get(monthKey);
    if (monthBucket) {
      monthBucket.orders++;
      monthBucket.revenue += o.total;
      if (o.customer.phone) monthBucket.customers.add(o.customer.phone);
    }

    // Günlük 90 bucket
    if (dateMs >= ninetyDaysAgoMs) {
      const dayKey = `${istDate.getUTCFullYear()}-${pad2(istDate.getUTCMonth() + 1)}-${pad2(istDate.getUTCDate())}`;
      const dayBucket = dailyMap.get(dayKey);
      if (dayBucket) {
        dayBucket.orders++;
        dayBucket.revenue += o.total;
      }
    }

    // Saatlik 7 gün penceresi
    if (dateMs >= sevenDaysAgoMs) {
      const hour = istDate.getUTCHours();
      hourBuckets[hour].count++;
      hourBuckets[hour].revenue += o.total;
    }
  }

  // ─── Top siparişler — allOrders zaten DESC sorted ────────────
  const recentOrders: DashboardStats["recentOrders"] = [];
  for (let i = 0; i < allOrders.length && recentOrders.length < 5; i++) {
    const o = allOrders[i];
    recentOrders.push({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.name,
      total: o.total,
      status: o.status as string,
      paymentMethod: o.payment?.method as string,
      createdAt: (o as unknown as { createdAt: Date }).createdAt,
    });
  }

  // ─── Top N derivative listeler ──────────────────────────────
  const topProducts = [...productMap.entries()]
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const categoryBreakdown = [...catMap.entries()]
    .map(([category, d]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      ...d,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topAddresses = [...addressMap.entries()]
    .map(([address, d]) => ({ address, ...d }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  const menuPreferences = [...menuPrefMap.entries()]
    .map(([name, d]) => ({
      name,
      category: d.category,
      categoryLabel: CATEGORY_LABELS[d.category] ?? d.category,
      quantity: d.quantity,
      revenue: d.revenue,
      orderCount: d.orderIds.size,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 15);

  const regionBreakdown = [...regionMap.entries()]
    .map(([district, d]) => ({
      district,
      orderCount: d.orderCount,
      revenue: d.revenue,
      avgBasket: d.orderCount > 0 ? d.revenue / d.orderCount : 0,
    }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  // ─── Müşteri kohortları ─────────────────────────────────────
  const nowMs = Date.now();
  const thisMonthStartMs = Date.UTC(currentY, currentM, 1) - ISTANBUL_OFFSET_MS;
  const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgoCohortMs = nowMs - 90 * 24 * 60 * 60 * 1000;

  let cohortNew = 0;
  let cohortReturning = 0;
  let cohortRepeat = 0;
  let cohortOneTime = 0;
  let cohortAtRisk = 0;
  let cohortLost = 0;

  for (const { firstMs, lastMs, count } of phoneMap.values()) {
    if (count >= 2) cohortRepeat++;
    else cohortOneTime++;

    const orderedThisMonth = lastMs >= thisMonthStartMs;
    if (firstMs >= thisMonthStartMs) cohortNew++;
    else if (orderedThisMonth) cohortReturning++;

    // Risk/kayıp — bu ay sipariş vermemişse son siparişin yaşına bak.
    if (!orderedThisMonth) {
      if (lastMs < ninetyDaysAgoCohortMs) cohortLost++;
      else if (lastMs < thirtyDaysAgoMs) cohortAtRisk++;
    }
  }

  const cohortTotal = phoneMap.size;
  const customerCohorts = {
    total: cohortTotal,
    newThisMonth: cohortNew,
    returningThisMonth: cohortReturning,
    repeatRate: cohortTotal > 0 ? (cohortRepeat / cohortTotal) * 100 : 0,
    oneTime: cohortOneTime,
    atRisk: cohortAtRisk,
    lost: cohortLost,
  };

  // ─── 90 günlük trend (sorted keys'ten map'le) ───────────────
  const revenueTrend = dailyOrder.map((key) => {
    const b = dailyMap.get(key)!;
    return { date: key, orders: b.orders, revenue: b.revenue };
  });

  // ─── Son 7 gün trendi (revenueTrend kuyruğundan, TR label ile)
  const dailyTrend = revenueTrend.slice(-7).map((d) => {
    const dt = new Date(d.date + "T00:00:00Z");
    return {
      date: dt.toLocaleDateString("tr-TR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      orders: d.orders,
      revenue: d.revenue,
    };
  });

  // ─── Aylık trend ────────────────────────────────────────────
  let cumRevenue = 0;
  const monthlyTrend = monthlyOrder.map((key, idx) => {
    const b = monthlyMap.get(key)!;
    cumRevenue += b.revenue;
    const target = idx === 0 ? Math.round(b.revenue * 0.9) : Math.round(cumRevenue / (idx + 1));
    return {
      month: key,
      label: b.label,
      orders: b.orders,
      revenue: b.revenue,
      target,
      customers: b.customers.size,
    };
  });

  return {
    todayOrderCount,
    todayRevenue,
    todayNet,
    activeOrderCount,
    totalOrderCount,
    totalRevenue,
    totalCustomerCount,
    totalProductCount,
    paymentBreakdown,
    paymentBreakdownAll,
    topProducts,
    categoryBreakdown,
    dailyTrend,
    statusBreakdown,
    activeOrders,
    recentOrders,
    topAddresses,
    menuPreferences,
    hourlyDistribution: hourBuckets,
    revenueTrend,
    monthlyTrend,
    regionBreakdown,
    customerCohorts,
  };
}

// ─── Belirli bir günün satışları (gün gezgini için) ─────────────────────────
// dayOffset: 0 = bugün, 1 = dün, 2 = evvelsi gün … (Istanbul günü bazlı).
export interface DaySales {
  dayOffset: number;
  dateISO: string; // "YYYY-MM-DD" (Istanbul günü)
  orderCount: number;
  revenue: number;
  net: number; // tahmini net (komisyon sonrası) — bkz. lib/commission
  products: {
    name: string;
    category: string;
    categoryLabel: string;
    quantity: number;
    revenue: number;
    orderCount: number;
  }[];
  payments: Record<PaymentKey, number>;
}

export async function getDaySales(
  source: DashboardSource = "all",
  dayOffset = 0,
): Promise<DaySales> {
  await connectDB();

  const safeOffset = Math.max(0, Math.min(365, Math.floor(dayOffset)));
  const dayStart = istanbulDayStartDaysAgo(safeOffset);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

  const orders = await OrderModel.find({
    ...buildSourceFilter(source),
    createdAt: { $gte: new Date(dayStartMs), $lt: new Date(dayEndMs) },
  })
    .select({
      id: 1,
      status: 1,
      total: 1,
      source: 1,
      "payment.method": 1,
      "items.quantity": 1,
      "items.totalPrice": 1,
      "items.product.name": 1,
      "items.product.category": 1,
    })
    .lean();

  const payments: Record<PaymentKey, number> = {
    cash: 0, card: 0, online: 0, meal_card: 0, iban: 0,
  };
  const productMap = new Map<
    string,
    { category: string; quantity: number; revenue: number; orderIds: Set<string> }
  >();
  let orderCount = 0;
  let revenue = 0;
  let net = 0;

  for (const o of orders) {
    if ((o.status as string) === "cancelled") continue;
    orderCount++;
    revenue += o.total;

    const method = o.payment?.method as PaymentKey | undefined;
    if (method && method in payments) payments[method] += o.total;
    net += estimateOrderNet(
      o.total,
      (o as unknown as { source?: OrderSource }).source,
      method === "meal_card",
    );

    for (const item of o.items) {
      const name = item.product.name;
      const cat = item.product.category;
      const p = productMap.get(name);
      if (p) {
        p.quantity += item.quantity;
        p.revenue += item.totalPrice;
        p.orderIds.add(o.id);
      } else {
        productMap.set(name, {
          category: cat,
          quantity: item.quantity,
          revenue: item.totalPrice,
          orderIds: new Set([o.id]),
        });
      }
    }
  }

  const products = [...productMap.entries()]
    .map(([name, d]) => ({
      name,
      category: d.category,
      categoryLabel: CATEGORY_LABELS[d.category] ?? d.category,
      quantity: d.quantity,
      revenue: d.revenue,
      orderCount: d.orderIds.size,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  return {
    dayOffset: safeOffset,
    dateISO: istanbulDateISO(dayStartMs),
    orderCount,
    revenue,
    net,
    payments,
    products,
  };
}

// ─── Sipariş bölgeleri (belirli gün) ────────────────────────────────────────
// Kurye teslimde GPS yakalamışsa (customer.geo) sipariş haritaya pinlenir.
// Pin yoksa geocoding yapmıyoruz (maliyet) — sipariş "konumu eksik" listesine
// düşer ve ilçe kırılımında yine sayılır.
import type { RegionPin } from "@/actions/trendyolRegions";

export interface OrderRegionStats {
  dayOffset: number;
  dateISO: string;
  totalOrders: number;
  totalRevenue: number;
  pinnedCount: number; // kurye GPS yakaladı (geo dolu)
  unpinnedCount: number; // pin yok (adresten tahmini)
  payments: Record<PaymentKey, number>;
  pins: RegionPin[];
  districts: {
    district: string;
    orderCount: number;
    revenue: number;
    pinnedCount: number;
  }[];
  unpinned: {
    id: string;
    orderNumber: number;
    customerName: string;
    district: string | null;
    address: string;
    total: number;
    status: string;
    createdAt: number;
  }[];
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

function parseFiniteCoord(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export async function getOrderRegions(
  source: DashboardSource = "all",
  dayOffset = 0,
): Promise<OrderRegionStats> {
  await connectDB();

  const safeOffset = Math.max(0, Math.min(365, Math.floor(dayOffset)));
  const dayStart = istanbulDayStartDaysAgo(safeOffset);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

  const orders = await OrderModel.find({
    ...buildSourceFilter(source),
    createdAt: { $gte: new Date(dayStartMs), $lt: new Date(dayEndMs) },
  })
    .select({
      id: 1,
      orderNumber: 1,
      status: 1,
      total: 1,
      createdAt: 1,
      "customer.name": 1,
      "customer.phone": 1,
      "customer.address": 1,
      "customer.district": 1,
      "customer.geo": 1,
      "payment.method": 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  // Pin fallback: siparişin kendi geo'su yoksa, müşteri kaydındaki (telefon)
  // pini kullan — kurye/sipariş ekranlarıyla aynı mantık (bkz. orders.ts
  // getGeoByPhone/withFallbackGeo). Aksi halde aynı müşterinin önceden
  // pinlenmiş siparişleri burada "pinsiz" görünüyordu.
  const phonesNeedingGeo = [
    ...new Set(
      orders
        .filter((o) => {
          const g = (o.customer as unknown as { geo?: { lat?: number } }).geo;
          return parseFiniteCoord(g?.lat) === null;
        })
        .map((o) => (o.customer as unknown as { phone?: string }).phone)
        .filter((p): p is string => !!p),
    ),
  ];
  const geoByPhone = new Map<string, { lat: number; lng: number }>();
  if (phonesNeedingGeo.length > 0) {
    const custs = await CustomerModel.find({ phone: { $in: phonesNeedingGeo } })
      .select({ phone: 1, geo: 1 })
      .lean();
    for (const c of custs) {
      const rec = c as unknown as {
        phone: string;
        geo?: { lat?: number; lng?: number };
      };
      const lat = parseFiniteCoord(rec.geo?.lat);
      const lng = parseFiniteCoord(rec.geo?.lng);
      if (lat !== null && lng !== null) geoByPhone.set(rec.phone, { lat, lng });
    }
  }

  const payments: Record<PaymentKey, number> = {
    cash: 0, card: 0, online: 0, meal_card: 0, iban: 0,
  };
  const districtMap = new Map<
    string,
    { orderCount: number; revenue: number; pinnedCount: number }
  >();
  const pins: RegionPin[] = [];
  const unpinned: OrderRegionStats["unpinned"] = [];

  let totalOrders = 0;
  let totalRevenue = 0;
  let pinnedCount = 0;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

  for (const o of orders) {
    if ((o.status as string) === "cancelled") continue;

    const status = o.status as string;
    const createdAt = (o as unknown as { createdAt: Date }).createdAt;
    const createdMs =
      createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();

    totalOrders++;
    totalRevenue += o.total;

    const method = o.payment?.method as PaymentKey | undefined;
    if (method && method in payments) payments[method] += o.total;

    const districtRaw = (
      (o.customer as unknown as { district?: string }).district ?? ""
    ).trim();
    const district = districtRaw || "Bilinmiyor";

    // Önce siparişin kendi pini; yoksa müşteri kaydındaki (telefon) pin.
    const ownGeo = (o.customer as unknown as {
      geo?: { lat?: number; lng?: number };
    }).geo;
    let lat = parseFiniteCoord(ownGeo?.lat);
    let lng = parseFiniteCoord(ownGeo?.lng);
    if (lat === null || lng === null) {
      const phone = (o.customer as unknown as { phone?: string }).phone;
      const fallback = phone ? geoByPhone.get(phone) : undefined;
      if (fallback) {
        lat = fallback.lat;
        lng = fallback.lng;
      }
    }
    const isPinned = lat !== null && lng !== null;

    const d = districtMap.get(district) ?? {
      orderCount: 0,
      revenue: 0,
      pinnedCount: 0,
    };
    d.orderCount++;
    d.revenue += o.total;
    if (isPinned) d.pinnedCount++;
    districtMap.set(district, d);

    if (isPinned) {
      pinnedCount++;
      if (lat! < minLat) minLat = lat!;
      if (lat! > maxLat) maxLat = lat!;
      if (lng! < minLng) minLng = lng!;
      if (lng! > maxLng) maxLng = lng!;
      pins.push({
        id: o.id,
        orderNumber: `${o.orderNumber}`,
        lat: lat!,
        lng: lng!,
        district: districtRaw || undefined,
        neighborhood: undefined,
        total: o.total,
        status, // ham status → RegionsMap renk anahtarı
        createdAt: createdMs,
      });
    } else {
      unpinned.push({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customer.name,
        district: districtRaw || null,
        address: (o.customer.address ?? "").trim(),
        total: o.total,
        status,
        createdAt: createdMs,
      });
    }
  }

  const districts = [...districtMap.entries()]
    .map(([district, v]) => ({ district, ...v }))
    .sort((a, b) => b.orderCount - a.orderCount);

  return {
    dayOffset: safeOffset,
    dateISO: istanbulDateISO(dayStartMs),
    totalOrders,
    totalRevenue,
    pinnedCount,
    unpinnedCount: unpinned.length,
    payments,
    pins,
    districts,
    unpinned,
    bounds:
      pinnedCount > 0 ? { minLat, maxLat, minLng, maxLng } : undefined,
  };
}

// ─── Kanal kıyaslaması (belirli gün) ────────────────────────────────────────
const CHANNEL_LABELS: Record<OrderSource, string> = {
  manual: "Manuel",
  trendyol: "Trendyol",
  getir: "Getir",
  yemeksepeti: "Yemeksepeti",
};

export interface ChannelBreakdown {
  dayOffset: number;
  dateISO: string;
  total: number;
  channels: {
    source: OrderSource;
    label: string;
    orderCount: number;
    revenue: number;
    net: number; // tahmini net (kanal komisyonu sonrası)
  }[];
}

export async function getChannelBreakdown(
  dayOffset = 0,
): Promise<ChannelBreakdown> {
  await connectDB();

  const safeOffset = Math.max(0, Math.min(365, Math.floor(dayOffset)));
  const dayStart = istanbulDayStartDaysAgo(safeOffset);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

  const orders = await OrderModel.find({
    createdAt: { $gte: new Date(dayStartMs), $lt: new Date(dayEndMs) },
  })
    .select({ status: 1, total: 1, source: 1 })
    .lean();

  // source alanı yoksa "manual" sayılır (eski kayıtlar).
  const map = new Map<OrderSource, { orderCount: number; revenue: number }>();
  let total = 0;

  for (const o of orders) {
    if ((o.status as string) === "cancelled") continue;
    const src = ((o as unknown as { source?: OrderSource }).source ??
      "manual") as OrderSource;
    total += o.total;
    const c = map.get(src);
    if (c) {
      c.orderCount++;
      c.revenue += o.total;
    } else {
      map.set(src, { orderCount: 1, revenue: o.total });
    }
  }

  const channels = (Object.keys(CHANNEL_LABELS) as OrderSource[])
    .map((source) => {
      const revenue = map.get(source)?.revenue ?? 0;
      return {
        source,
        label: CHANNEL_LABELS[source],
        orderCount: map.get(source)?.orderCount ?? 0,
        revenue,
        // Kanal seviyesinde tahmini net — yemek kartı ek kesintisi yöntem
        // kırılımı olmadan uygulanamadığından sadece kanal komisyonu düşülür.
        net: estimateOrderNet(revenue, source),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    dayOffset: safeOffset,
    dateISO: istanbulDateISO(dayStartMs),
    total,
    channels,
  };
}

// ─── Canlı operasyon snapshot ("şu an ne oluyor") ───────────────────────────
// Açık (teslim edilmemiş) siparişlerin canlı durumu + bugünkü teslim hızı.
// Sadece "bugün" anlamlı olduğu için Özet'in üst şeridinde gösterilir.
export interface LiveOpsOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  total: number;
  status: string;
  source: OrderSource;
  ageMin: number; // sipariş alınışından beri geçen dakika
  sla: SlaLevel; // ok | warn | critical
}

export interface OperationalSnapshot {
  kitchenCount: number; // pending + preparing (mutfakta)
  onTheWayCount: number; // yolda
  lateCount: number; // SLA warn+critical (geciken)
  criticalCount: number; // SLA critical (kritik geciken)
  avgDeliveryMin: number | null; // bugün teslim edilenlerin ort. süresi (dk)
  deliveredToday: number; // bugün teslim edilen adet
  openOrders: LiveOpsOrder[]; // açık siparişler — geciken üstte sıralı
}

const OPEN_STATUSES = ["pending", "preparing", "on-the-way"];

export async function getOperationalSnapshot(
  source: DashboardSource = "all",
): Promise<OperationalSnapshot> {
  await connectDB();

  const now = Date.now();
  const todayStartMs = istanbulDayStart().getTime();

  // İki hafif sorgu: açık siparişler (canlı) + bugün teslim edilenler (hız).
  const [openDocs, deliveredDocs] = await Promise.all([
    OrderModel.find({
      ...buildSourceFilter(source),
      status: { $in: OPEN_STATUSES },
    })
      .select({
        id: 1,
        orderNumber: 1,
        status: 1,
        total: 1,
        source: 1,
        createdAt: 1,
        "customer.name": 1,
      })
      .lean(),
    OrderModel.find({
      ...buildSourceFilter(source),
      status: "delivered",
      deliveredAt: { $gte: new Date(todayStartMs) },
      deliveryDurationMin: { $gt: 0 },
    })
      .select({ deliveryDurationMin: 1 })
      .lean(),
  ]);

  let kitchenCount = 0;
  let onTheWayCount = 0;
  let lateCount = 0;
  let criticalCount = 0;

  const openOrders: LiveOpsOrder[] = openDocs.map((o) => {
    const status = o.status as string;
    const createdAt = (o as unknown as { createdAt: Date }).createdAt;
    const createdMs =
      createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
    const ageMin = Math.max(0, Math.round((now - createdMs) / 60000));
    const sla = slaLevel(ageMin);

    if (status === "on-the-way") onTheWayCount++;
    else kitchenCount++;
    if (sla !== "ok") lateCount++;
    if (sla === "critical") criticalCount++;

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.name,
      total: o.total,
      status,
      source: ((o as unknown as { source?: OrderSource }).source ??
        "manual") as OrderSource,
      ageMin,
      sla,
    };
  });

  // Geciken (yaşça en yaşlı) üstte.
  openOrders.sort((a, b) => b.ageMin - a.ageMin);

  const deliveredToday = deliveredDocs.length;
  const avgDeliveryMin =
    deliveredToday > 0
      ? Math.round(
          deliveredDocs.reduce(
            (s, d) =>
              s + ((d as unknown as { deliveryDurationMin: number }).deliveryDurationMin ?? 0),
            0,
          ) / deliveredToday,
        )
      : null;

  return {
    kitchenCount,
    onTheWayCount,
    lateCount,
    criticalCount,
    avgDeliveryMin,
    deliveredToday,
    openOrders,
  };
}
