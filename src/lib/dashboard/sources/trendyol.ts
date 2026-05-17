// Trendyol canlı adapter — /packages + /settlements API'sından okur.
// getTrendyolDashboardStats: today/week/month. Bizim DashboardPeriod ile mapping:
//   today → today, 7d → week, 30d/month → month

import {
  getTrendyolDashboardStats,
  type TrendyolDashboardStats,
  type TrendyolPeriod,
} from "@/actions/trendyolDashboard";
import { trendyolStatus } from "../status";
import type { DashboardSourceAdapter, DashboardPeriod } from "./types";
import type {
  DashboardViewModel,
  HourlyBucketVM,
  MetricVM,
  PaymentBreakdownVM,
  RecentOrderVM,
  StatusBreakdownVM,
  TopProductVM,
  TrendVM,
} from "../types";

function toTrendyolPeriod(p: DashboardPeriod): TrendyolPeriod {
  if (p === "today") return "today";
  if (p === "7d") return "week";
  return "month";
}

function buildMetrics(s: TrendyolDashboardStats): MetricVM[] {
  const cancelRate =
    s.orderCount + s.cancelledCount > 0
      ? (s.cancelledCount / (s.orderCount + s.cancelledCount)) * 100
      : 0;

  return [
    {
      key: "revenue",
      label: "Brüt Ciro",
      value: s.revenue,
      format: "currency",
    },
    {
      key: "net",
      label: "Net Hakediş",
      value: s.finance.netRevenue,
      format: "currency",
    },
    {
      key: "orders",
      label: "Sipariş",
      value: s.orderCount,
      format: "int",
    },
    {
      key: "delivered",
      label: "Teslim Edilen",
      value: s.deliveredCount,
      format: "int",
    },
    {
      key: "avgBasket",
      label: "Sepet Ortalama",
      value: s.avgBasket,
      format: "currency",
    },
    {
      key: "cancelRate",
      label: "İptal Oranı",
      value: cancelRate,
      format: "pct",
      positiveIsGood: false,
    },
  ];
}

function buildTrend(s: TrendyolDashboardStats): TrendVM {
  // Trendyol için trend ekseni = saatlik dağılım. Ay/hafta için gün bazlı
  // bucket gelmiyor; aynı hourly'yi gösteriyoruz (period changed olunca
  // toplam değişir). İleride day-bucket eklenirse burada normalize edilir.
  return {
    primaryLabel: "Ciro",
    secondaryLabel: "Sipariş",
    primaryFormat: "currency",
    buckets: s.hourly.map((h) => ({
      label: `${String(h.hour).padStart(2, "0")}`,
      primary: h.revenue,
      secondary: h.orders,
    })),
  };
}

function buildProducts(s: TrendyolDashboardStats): TopProductVM[] {
  const max = s.topProducts[0]?.quantity ?? 1;
  return s.topProducts.slice(0, 8).map((p) => ({
    name: p.name,
    quantity: p.quantity,
    revenue: p.revenue,
    share: max > 0 ? p.quantity / max : 0,
  }));
}

function buildRecentOrders(s: TrendyolDashboardStats): RecentOrderVM[] {
  return s.recentOrders.map((o) => {
    const meta = trendyolStatus(o.status);
    return {
      id: o.id,
      orderNumber: `#${o.orderNumber}`,
      customerName: o.customerName,
      total: o.total,
      net: o.netRevenue,
      statusLabel: meta.label,
      statusTone: meta.tone,
      paymentLabel: o.paymentMethod,
      createdAt: o.createdAt,
    };
  });
}

function buildPaymentBreakdown(s: TrendyolDashboardStats): PaymentBreakdownVM[] {
  const total = s.paymentBreakdown.reduce((a, p) => a + p.revenue, 0);
  return s.paymentBreakdown.map((p) => ({
    key: p.key,
    label: p.label,
    count: p.count,
    revenue: p.revenue,
    share: total > 0 ? p.revenue / total : 0,
  }));
}

function buildStatusBreakdown(s: TrendyolDashboardStats): StatusBreakdownVM[] {
  return s.statusBreakdown.map((row) => {
    const meta = trendyolStatus(row.status);
    return { status: row.status, label: meta.label, tone: meta.tone, count: row.count };
  });
}

function buildHourly(s: TrendyolDashboardStats): HourlyBucketVM[] {
  return s.hourly;
}

export const trendyolAdapter: DashboardSourceAdapter = {
  key: "trendyol",
  label: "Trendyol",
  supportedPeriods: ["today", "7d", "30d"],
  defaultPeriod: "today",
  async load(period) {
    const s = await getTrendyolDashboardStats(toTrendyolPeriod(period));
    const vm: DashboardViewModel = {
      source: "trendyol",
      fetchedAt: new Date(s.fetchedAt).getTime(),
      rangeStart: s.rangeStart,
      rangeEnd: s.rangeEnd,
      metrics: buildMetrics(s),
      trend: buildTrend(s),
      topProducts: buildProducts(s),
      recentOrders: buildRecentOrders(s),
      paymentBreakdown: buildPaymentBreakdown(s),
      statusBreakdown: buildStatusBreakdown(s),
      extensions: {
        finance: {
          grossSales: s.finance.grossSales,
          totalDiscount: s.finance.totalDiscount,
          totalCoupon: s.finance.totalCoupon,
          totalRefund: s.finance.totalRefund,
          totalCommission: s.finance.totalCommission,
          netRevenue: s.finance.netRevenue,
          available: s.settlementsAvailable,
          error: s.settlementsError,
        },
        mealCardBreakdown: s.mealCardBreakdown,
        hourly: buildHourly(s),
      },
      error: s.error,
    };
    return vm;
  },
};
