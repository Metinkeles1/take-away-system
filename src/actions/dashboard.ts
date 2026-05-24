"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import CustomerModel from "@/models/Customer";
import ProductModel from "@/models/Product";
import { type OrderSource } from "@/types";
import { istanbulDayStart, istanbulDayStartDaysAgo } from "@/lib/datetime";

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
  const statusBreakdown: Record<string, number> = {};

  let totalOrderCount = 0;
  let totalRevenue = 0;
  let todayOrderCount = 0;
  let todayRevenue = 0;
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
    if (dateMs >= todayStartMs) {
      todayOrderCount++;
      todayRevenue += o.total;
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
  };
}
