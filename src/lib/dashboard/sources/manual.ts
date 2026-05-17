// Manuel + cross-source adapter. getDashboardStats üzerinden çalışır.
// DashboardSource = "all" | "manual" | "trendyol" | "getir" | "yemeksepeti"
// "trendyol" için DB'de kayıt yoksa boş döner — Trendyol canlı dashboard'u
// /lib/dashboard/sources/trendyol.ts kullanır.

import {
  getDashboardStats,
  type DashboardSource,
  type DashboardStats,
} from "@/actions/dashboard";
import { manualStatus } from "../status";
import type { DashboardSourceAdapter, DashboardPeriod } from "./types";
import type {
  DashboardViewModel,
  MetricVM,
  PaymentBreakdownVM,
  RecentOrderVM,
  StatusBreakdownVM,
  TopProductVM,
  TrendVM,
} from "../types";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kredi Kartı",
  online: "Online",
  meal_card: "Yemek Kartı",
  iban: "IBAN",
};

const SOURCE_LABEL: Record<string, string> = {
  all: "Tüm Kanallar",
  manual: "Manuel Siparişler",
  trendyol: "Trendyol (DB)",
  getir: "Getir",
  yemeksepeti: "Yemeksepeti",
};

function buildMetrics(stats: DashboardStats): MetricVM[] {
  const aov =
    stats.todayOrderCount > 0 ? stats.todayRevenue / stats.todayOrderCount : 0;

  return [
    {
      key: "todayRevenue",
      label: "Bugünkü Ciro",
      value: stats.todayRevenue,
      format: "currency",
    },
    {
      key: "todayOrders",
      label: "Bugünkü Sipariş",
      value: stats.todayOrderCount,
      format: "int",
    },
    {
      key: "activeOrders",
      label: "Aktif Sipariş",
      value: stats.activeOrderCount,
      format: "int",
    },
    {
      key: "aov",
      label: "Sepet Ortalama",
      value: aov,
      format: "currency",
    },
    {
      key: "totalOrders",
      label: "Toplam Sipariş",
      value: stats.totalOrderCount,
      format: "compact",
    },
    {
      key: "totalRevenue",
      label: "Toplam Ciro",
      value: stats.totalRevenue,
      format: "currency",
    },
  ];
}

function buildTrend(stats: DashboardStats): TrendVM {
  return {
    primaryLabel: "Ciro",
    secondaryLabel: "Sipariş",
    primaryFormat: "currency",
    buckets: stats.dailyTrend.map((d) => ({
      label: d.date,
      primary: d.revenue,
      secondary: d.orders,
    })),
  };
}

function buildProducts(stats: DashboardStats): TopProductVM[] {
  const max = stats.topProducts[0]?.quantity ?? 1;
  return stats.topProducts.slice(0, 8).map((p) => ({
    name: p.name,
    quantity: p.quantity,
    revenue: p.revenue,
    share: max > 0 ? p.quantity / max : 0,
  }));
}

function buildRecentOrders(stats: DashboardStats): RecentOrderVM[] {
  return stats.recentOrders.map((o) => {
    const meta = manualStatus(o.status);
    return {
      id: o.id,
      orderNumber: `#${o.orderNumber}`,
      customerName: o.customerName,
      total: o.total,
      statusLabel: meta.label,
      statusTone: meta.tone,
      paymentLabel: PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod,
      createdAt: new Date(o.createdAt).getTime(),
    };
  });
}

function buildPaymentBreakdown(stats: DashboardStats): PaymentBreakdownVM[] {
  const entries = Object.entries(stats.paymentBreakdownAll);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return entries
    .filter(([, v]) => v > 0)
    .map(([key, revenue]) => ({
      key,
      label: PAYMENT_LABEL[key] ?? key,
      revenue,
      share: total > 0 ? revenue / total : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildStatusBreakdown(stats: DashboardStats): StatusBreakdownVM[] {
  return Object.entries(stats.statusBreakdown)
    .map(([status, count]) => {
      const meta = manualStatus(status);
      return { status, label: meta.label, tone: meta.tone, count };
    })
    .sort((a, b) => b.count - a.count);
}

async function loadForSource(
  source: DashboardSource,
  period: DashboardPeriod,
): Promise<DashboardViewModel> {
  // Şu an getDashboardStats period parametresi almıyor (tüm zaman + son 7 gün).
  // Period bilgisini ileride backend'e taşımak için imzayı şimdiden taşıyoruz.
  void period;
  const stats = await getDashboardStats(source);

  return {
    source,
    fetchedAt: Date.now(),
    rangeStart: 0,
    rangeEnd: Date.now(),
    metrics: buildMetrics(stats),
    trend: buildTrend(stats),
    topProducts: buildProducts(stats),
    recentOrders: buildRecentOrders(stats),
    paymentBreakdown: buildPaymentBreakdown(stats),
    statusBreakdown: buildStatusBreakdown(stats),
    extensions: {
      topAddresses: stats.topAddresses.slice(0, 8).map((a) => ({
        address: a.address,
        orderCount: a.orderCount,
        revenue: a.revenue,
      })),
      categoryBreakdown: stats.categoryBreakdown,
    },
  };
}

export function createManualAdapter(
  source: DashboardSource,
): DashboardSourceAdapter {
  return {
    key: source,
    label: SOURCE_LABEL[source] ?? source,
    supportedPeriods: ["7d"],
    defaultPeriod: "7d",
    load: (period) => loadForSource(source, period),
  };
}
