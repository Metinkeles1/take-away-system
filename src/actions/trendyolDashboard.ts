"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";

export interface TrendyolDashboardStats {
  // Özet
  todayOrderCount: number;
  todayRevenue: number;
  yesterdayRevenue: number;
  activeOrderCount: number;
  totalOrderCount: number;
  totalRevenue: number;
  avgBasket: number;
  todayCancelledCount: number;
  acceptanceRate: number; // bugün non-cancelled / bugün toplam

  // Ödeme dağılımı (bugün ve tüm zamanlar)
  paymentToday: Record<string, number>;
  paymentAll: Record<string, number>;

  // Durum dağılımı (tüm zamanlar)
  statusBreakdown: Record<string, number>;

  // Bugün saatlik (24 bucket)
  hourlyToday: { hour: number; orders: number; revenue: number }[];

  // Son 7 gün
  dailyTrend: { date: string; orders: number; revenue: number }[];

  // En çok satan ürünler
  topProducts: { name: string; quantity: number; revenue: number }[];

  // Son Trendyol siparişleri
  recentOrders: {
    id: string;
    orderNumber: number;
    customerName: string;
    total: number;
    status: string;
    paymentMethod: string;
    externalRef?: string;
    createdAt: Date;
  }[];
}

const EMPTY_PAYMENT: Record<string, number> = {
  cash: 0,
  card: 0,
  online: 0,
  meal_card: 0,
  iban: 0,
};

type PaymentAgg = { _id: string; total: number };
type StatusAgg = { _id: string; count: number };
type HourAgg = { _id: number; orders: number; revenue: number };
type DayAgg = { _id: string; orders: number; revenue: number };
type ProductAgg = { _id: string; quantity: number; revenue: number };
type SummaryAgg = {
  todayOrderCount: number;
  todayRevenue: number;
  todayCancelledCount: number;
  activeOrderCount: number;
  totalOrderCount: number;
  totalRevenue: number;
};
type RecentAgg = {
  id: string;
  orderNumber: number;
  customer: { name: string };
  total: number;
  status: string;
  payment: { method: string };
  externalRef?: string;
  createdAt: Date;
};

export async function getTrendyolDashboardStats(): Promise<TrendyolDashboardStats> {
  await connectDB();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const baseMatch = { source: "trendyol" } as const;
  const activeStatuses = ["pending", "preparing", "on-the-way"];

  // Tek aggregation pipeline ile tüm hesaplamaları $facet altında topla
  const [result] = await OrderModel.aggregate<{
    summary: SummaryAgg[];
    yesterday: { revenue: number }[];
    paymentToday: PaymentAgg[];
    paymentAll: PaymentAgg[];
    statusBreakdown: StatusAgg[];
    hourlyToday: HourAgg[];
    dailyTrend: DayAgg[];
    topProducts: ProductAgg[];
    recentOrders: RecentAgg[];
  }>([
    { $match: baseMatch },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              todayOrderCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ["$createdAt", todayStart] },
                        { $lt: ["$createdAt", tomorrowStart] },
                        { $ne: ["$status", "cancelled"] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              todayRevenue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ["$createdAt", todayStart] },
                        { $lt: ["$createdAt", tomorrowStart] },
                        { $ne: ["$status", "cancelled"] },
                      ],
                    },
                    "$total",
                    0,
                  ],
                },
              },
              todayCancelledCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ["$createdAt", todayStart] },
                        { $lt: ["$createdAt", tomorrowStart] },
                        { $eq: ["$status", "cancelled"] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              activeOrderCount: {
                $sum: { $cond: [{ $in: ["$status", activeStatuses] }, 1, 0] },
              },
              totalOrderCount: {
                $sum: { $cond: [{ $ne: ["$status", "cancelled"] }, 1, 0] },
              },
              totalRevenue: {
                $sum: { $cond: [{ $ne: ["$status", "cancelled"] }, "$total", 0] },
              },
            },
          },
          { $project: { _id: 0 } },
        ],
        yesterday: [
          {
            $match: {
              createdAt: { $gte: yesterdayStart, $lt: todayStart },
              status: { $ne: "cancelled" },
            },
          },
          { $group: { _id: null, revenue: { $sum: "$total" } } },
          { $project: { _id: 0, revenue: 1 } },
        ],
        paymentToday: [
          {
            $match: {
              createdAt: { $gte: todayStart, $lt: tomorrowStart },
              status: { $ne: "cancelled" },
            },
          },
          { $group: { _id: "$payment.method", total: { $sum: "$total" } } },
        ],
        paymentAll: [
          { $match: { status: { $ne: "cancelled" } } },
          { $group: { _id: "$payment.method", total: { $sum: "$total" } } },
        ],
        statusBreakdown: [
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ],
        hourlyToday: [
          {
            $match: {
              createdAt: { $gte: todayStart, $lt: tomorrowStart },
              status: { $ne: "cancelled" },
            },
          },
          {
            $group: {
              _id: { $hour: { date: "$createdAt", timezone: "Europe/Istanbul" } },
              orders: { $sum: 1 },
              revenue: { $sum: "$total" },
            },
          },
          { $sort: { _id: 1 } },
        ],
        dailyTrend: [
          {
            $match: {
              createdAt: { $gte: sevenDaysAgo, $lt: tomorrowStart },
              status: { $ne: "cancelled" },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                  timezone: "Europe/Istanbul",
                },
              },
              orders: { $sum: 1 },
              revenue: { $sum: "$total" },
            },
          },
          { $sort: { _id: 1 } },
        ],
        topProducts: [
          { $match: { status: { $ne: "cancelled" } } },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.product.name",
              quantity: { $sum: "$items.quantity" },
              revenue: { $sum: "$items.totalPrice" },
            },
          },
          { $sort: { quantity: -1 } },
          { $limit: 10 },
        ],
        recentOrders: [
          { $sort: { createdAt: -1 } },
          { $limit: 8 },
          {
            $project: {
              _id: 0,
              id: 1,
              orderNumber: 1,
              "customer.name": 1,
              total: 1,
              status: 1,
              "payment.method": 1,
              externalRef: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
  ]);

  const summary = result.summary[0] ?? {
    todayOrderCount: 0,
    todayRevenue: 0,
    todayCancelledCount: 0,
    activeOrderCount: 0,
    totalOrderCount: 0,
    totalRevenue: 0,
  };
  const yesterdayRevenue = result.yesterday[0]?.revenue ?? 0;
  const avgBasket =
    summary.totalOrderCount > 0 ? summary.totalRevenue / summary.totalOrderCount : 0;
  const todayTotal = summary.todayOrderCount + summary.todayCancelledCount;
  const acceptanceRate =
    todayTotal > 0 ? (summary.todayOrderCount / todayTotal) * 100 : 100;

  const paymentToday = { ...EMPTY_PAYMENT };
  for (const p of result.paymentToday) if (p._id in paymentToday) paymentToday[p._id] = p.total;
  const paymentAll = { ...EMPTY_PAYMENT };
  for (const p of result.paymentAll) if (p._id in paymentAll) paymentAll[p._id] = p.total;

  const statusBreakdown: Record<string, number> = {};
  for (const s of result.statusBreakdown) statusBreakdown[s._id] = s.count;

  // 24 saatlik bucket — eksik saatleri 0 ile doldur
  const hourlyMap = new Map(result.hourlyToday.map((h) => [h._id, h]));
  const hourlyToday = Array.from({ length: 24 }, (_, i) => {
    const h = hourlyMap.get(i);
    return { hour: i, orders: h?.orders ?? 0, revenue: h?.revenue ?? 0 };
  });

  // 7 günlük — eksik günleri 0 ile doldur, tr-TR etiketle
  const dailyMap = new Map(result.dailyTrend.map((d) => [d._id, d]));
  const dailyTrend: TrendyolDashboardStats["dailyTrend"] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const found = dailyMap.get(key);
    dailyTrend.push({
      date: d.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short" }),
      orders: found?.orders ?? 0,
      revenue: found?.revenue ?? 0,
    });
  }

  const topProducts = result.topProducts.map((p) => ({
    name: p._id,
    quantity: p.quantity,
    revenue: p.revenue,
  }));

  const recentOrders = result.recentOrders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customer?.name ?? "—",
    total: o.total,
    status: o.status,
    paymentMethod: o.payment?.method ?? "online",
    externalRef: o.externalRef,
    createdAt: o.createdAt,
  }));

  return {
    todayOrderCount: summary.todayOrderCount,
    todayRevenue: summary.todayRevenue,
    yesterdayRevenue,
    activeOrderCount: summary.activeOrderCount,
    totalOrderCount: summary.totalOrderCount,
    totalRevenue: summary.totalRevenue,
    avgBasket,
    todayCancelledCount: summary.todayCancelledCount,
    acceptanceRate,
    paymentToday,
    paymentAll,
    statusBreakdown,
    hourlyToday,
    dailyTrend,
    topProducts,
    recentOrders,
  };
}
