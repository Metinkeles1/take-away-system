"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import CustomerModel from "@/models/Customer";
import ProductModel from "@/models/Product";
import { type OrderSource } from "@/types";

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
  // Genel
  todayOrderCount: number;
  todayRevenue: number;
  activeOrderCount: number;
  totalOrderCount: number;
  totalRevenue: number;
  totalCustomerCount: number;
  totalProductCount: number;

  // Ödeme dağılımı (bugün)
  paymentBreakdown: {
    cash: number;
    card: number;
    online: number;
    meal_card: number;
    iban: number;
  };

  // Ödeme dağılımı (tüm zamanlar)
  paymentBreakdownAll: {
    cash: number;
    card: number;
    online: number;
    meal_card: number;
    iban: number;
  };

  // En çok satan ürünler (tüm zamanlar, top 10)
  topProducts: { name: string; quantity: number; revenue: number }[];

  // Kategori dağılımı
  categoryBreakdown: { category: string; label: string; quantity: number; revenue: number }[];

  // Son 7 gün trend
  dailyTrend: { date: string; orders: number; revenue: number }[];

  // Sipariş durum dağılımı
  statusBreakdown: Record<string, number>;

  // Son siparişler (aktif olanlar)
  activeOrders: {
    id: string;
    orderNumber: number;
    customerName: string;
    total: number;
    status: string;
    createdAt: Date;
  }[];

  // Son 5 sipariş
  recentOrders: {
    id: string;
    orderNumber: number;
    customerName: string;
    total: number;
    status: string;
    paymentMethod: string;
    createdAt: Date;
  }[];

  // En çok sipariş veren adresler
  topAddresses: {
    address: string;
    orderCount: number;
    revenue: number;
  }[];

  // En çok tercih edilen menüler (detaylı)
  menuPreferences: {
    name: string;
    category: string;
    categoryLabel: string;
    quantity: number;
    revenue: number;
    orderCount: number;
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

export async function getDashboardStats(
  source: DashboardSource = "all",
): Promise<DashboardStats> {
  await connectDB();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  // Kaynak filtresine göre siparişleri çek
  const allOrders = await OrderModel.find(buildSourceFilter(source))
    .sort({ createdAt: -1 })
    .lean();

  const nonCancelled = allOrders.filter((o) => o.status !== "cancelled");
  const todayOrders = nonCancelled.filter(
    (o) => new Date((o as unknown as { createdAt: Date }).createdAt) >= todayStart,
  );

  // ─── Genel istatistikler ─────────────────────────────────────
  const todayOrderCount = todayOrders.length;
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
  const activeOrderCount = allOrders.filter(
    (o) => o.status === "pending" || o.status === "preparing" || o.status === "on-the-way",
  ).length;
  const totalOrderCount = nonCancelled.length;
  const totalRevenue = nonCancelled.reduce((s, o) => s + o.total, 0);

  const [totalCustomerCount, totalProductCount] = await Promise.all([
    CustomerModel.countDocuments(),
    ProductModel.countDocuments(),
  ]);

  // ─── Ödeme dağılımı (bugün) ──────────────────────────────────
  const paymentBreakdown = { cash: 0, card: 0, online: 0, meal_card: 0, iban: 0 };
  for (const o of todayOrders) {
    const method = o.payment?.method as keyof typeof paymentBreakdown;
    if (method && method in paymentBreakdown) {
      paymentBreakdown[method] += o.total;
    }
  }

  // ─── Ödeme dağılımı (tüm zamanlar) ──────────────────────────
  const paymentBreakdownAll = { cash: 0, card: 0, online: 0, meal_card: 0, iban: 0 };
  for (const o of nonCancelled) {
    const method = o.payment?.method as keyof typeof paymentBreakdownAll;
    if (method && method in paymentBreakdownAll) {
      paymentBreakdownAll[method] += o.total;
    }
  }

  // ─── En çok satan ürünler ────────────────────────────────────
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  for (const o of nonCancelled) {
    for (const item of o.items) {
      const name = item.product.name;
      const existing = productMap.get(name) ?? { quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += item.totalPrice;
      productMap.set(name, existing);
    }
  }
  const topProducts = [...productMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  // ─── Kategori dağılımı ──────────────────────────────────────
  const catMap = new Map<string, { quantity: number; revenue: number }>();
  for (const o of nonCancelled) {
    for (const item of o.items) {
      const cat = item.product.category;
      const existing = catMap.get(cat) ?? { quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += item.totalPrice;
      catMap.set(cat, existing);
    }
  }
  const categoryBreakdown = [...catMap.entries()]
    .map(([category, data]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      ...data,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ─── Son 7 gün trend ────────────────────────────────────────
  const dailyTrend: DashboardStats["dailyTrend"] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(todayStart);
    date.setDate(date.getDate() - i);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayOrders = nonCancelled.filter((o) => {
      const d = new Date((o as unknown as { createdAt: Date }).createdAt);
      return d >= date && d < nextDate;
    });

    dailyTrend.push({
      date: date.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short" }),
      orders: dayOrders.length,
      revenue: dayOrders.reduce((s, o) => s + o.total, 0),
    });
  }

  // ─── Sipariş durum dağılımı ─────────────────────────────────
  const statusBreakdown: Record<string, number> = {};
  for (const o of allOrders) {
    statusBreakdown[o.status as string] = (statusBreakdown[o.status as string] ?? 0) + 1;
  }

  // ─── Aktif siparişler ───────────────────────────────────────
  const activeOrders = allOrders
    .filter(
      (o) => o.status === "pending" || o.status === "preparing" || o.status === "on-the-way",
    )
    .slice(0, 10)
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.name,
      total: o.total,
      status: o.status as string,
      createdAt: (o as unknown as { createdAt: Date }).createdAt,
    }));

  // ─── Son siparişler ─────────────────────────────────────────
  const recentOrders = allOrders.slice(0, 5).map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customer.name,
    total: o.total,
    status: o.status as string,
    paymentMethod: o.payment?.method as string,
    createdAt: (o as unknown as { createdAt: Date }).createdAt,
  }));

  // ─── En çok sipariş veren adresler ─────────────────────────
  const addressMap = new Map<string, { orderCount: number; revenue: number }>();
  for (const o of nonCancelled) {
    const addr = (o.customer.address ?? "").trim();
    if (!addr) continue;
    const existing = addressMap.get(addr) ?? { orderCount: 0, revenue: 0 };
    existing.orderCount += 1;
    existing.revenue += o.total;
    addressMap.set(addr, existing);
  }
  const topAddresses = [...addressMap.entries()]
    .map(([address, data]) => ({ address, ...data }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  // ─── En çok tercih edilen menüler (detaylı) ─────────────────
  const menuPrefMap = new Map<
    string,
    { category: string; quantity: number; revenue: number; orderIds: Set<string> }
  >();
  for (const o of nonCancelled) {
    for (const item of o.items) {
      const name = item.product.name;
      const existing = menuPrefMap.get(name) ?? {
        category: item.product.category,
        quantity: 0,
        revenue: 0,
        orderIds: new Set<string>(),
      };
      existing.quantity += item.quantity;
      existing.revenue += item.totalPrice;
      existing.orderIds.add(o.id);
      menuPrefMap.set(name, existing);
    }
  }
  const menuPreferences = [...menuPrefMap.entries()]
    .map(([name, data]) => ({
      name,
      category: data.category,
      categoryLabel: CATEGORY_LABELS[data.category] ?? data.category,
      quantity: data.quantity,
      revenue: data.revenue,
      orderCount: data.orderIds.size,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 15);

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
  };
}
