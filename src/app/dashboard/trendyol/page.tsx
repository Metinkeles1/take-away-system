"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getTrendyolDashboardStats,
  type TrendyolDashboardStats,
} from "@/actions/trendyolDashboard";
import {
  ShoppingBag,
  CircleDollarSign,
  Flame,
  TrendingUp,
  TrendingDown,
  Receipt,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Store,
  CalendarDays,
} from "lucide-react";
import { KPICard, KPICardSkeleton } from "@/components/dashboard/KPICard";
import { PaymentBreakdown } from "@/components/dashboard/PaymentBreakdown";
import { StatusDonut } from "@/components/dashboard/StatusDonut";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { statusConfig } from "@/app/dashboard/constants/dashboardConfig";
import { type Order } from "@/types";

const POLL_INTERVAL_MS = 30_000;

export default function TrendyolDashboardPage() {
  const [stats, setStats] = useState<TrendyolDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getTrendyolDashboardStats();
      setStats(data);
      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, POLL_INTERVAL_MS);
    const handleFocus = () => loadStats();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadStats]);

  const todayTrend = useMemo(() => {
    if (!stats) return null;
    if (stats.yesterdayRevenue === 0) return null;
    const pct =
      ((stats.todayRevenue - stats.yesterdayRevenue) / stats.yesterdayRevenue) * 100;
    return { pct: Math.round(pct), up: pct >= 0 };
  }, [stats]);

  const totalPaymentToday = useMemo(
    () => Object.values(stats?.paymentToday ?? {}).reduce((a, b) => a + b, 0),
    [stats?.paymentToday],
  );
  const totalPaymentAll = useMemo(
    () => Object.values(stats?.paymentAll ?? {}).reduce((a, b) => a + b, 0),
    [stats?.paymentAll],
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TrendyolHeader
        isLoading={isLoading}
        onRefresh={loadStats}
        lastUpdated={lastUpdated}
      />

      <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-br from-orange-50/40 via-gray-50 to-white">
        <div className="px-8 py-6 space-y-6">
          {/* KPI Kartları */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {isLoading && !stats ? (
              [...Array(4)].map((_, i) => <KPICardSkeleton key={i} />)
            ) : (
              <>
                <KPICard
                  label="Bugünkü Trendyol Siparişi"
                  value={String(stats?.todayOrderCount ?? 0)}
                  icon={ShoppingBag}
                  color="blue"
                  trend={todayTrend}
                  trendLabel="dünkü ciroya göre"
                />
                <KPICard
                  label="Bugünkü Trendyol Cirosu"
                  value={formatCurrency(stats?.todayRevenue ?? 0)}
                  icon={CircleDollarSign}
                  color="emerald"
                />
                <KPICard
                  label="Aktif Trendyol Siparişi"
                  value={String(stats?.activeOrderCount ?? 0)}
                  icon={Flame}
                  color="amber"
                />
                <KPICard
                  label="Ortalama Sepet"
                  value={formatCurrency(stats?.avgBasket ?? 0)}
                  icon={Receipt}
                  color="violet"
                />
              </>
            )}
          </div>

          {/* Sağlık Göstergeleri */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <HealthCard
              icon={CheckCircle2}
              label="Kabul Oranı (Bugün)"
              value={`%${(stats?.acceptanceRate ?? 100).toFixed(0)}`}
              tone="emerald"
              hint={`${stats?.todayCancelledCount ?? 0} iptal`}
              loading={isLoading && !stats}
            />
            <HealthCard
              icon={TrendingUp}
              label="Toplam Sipariş (Trendyol)"
              value={String(stats?.totalOrderCount ?? 0)}
              tone="blue"
              hint={`${formatCurrency(stats?.totalRevenue ?? 0)} ciro`}
              loading={isLoading && !stats}
            />
            <HealthCard
              icon={TrendingDown}
              label="Dünkü Ciro"
              value={formatCurrency(stats?.yesterdayRevenue ?? 0)}
              tone="slate"
              hint="karşılaştırma için"
              loading={isLoading && !stats}
            />
          </div>

          {/* Saatlik + Durum + Ödeme */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-2 bg-white rounded-2xl border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Bugün Saatlik Sipariş Yoğunluğu
                </CardTitle>
              </CardHeader>
              <CardContent>
                <HourlyChart data={stats?.hourlyToday} loading={isLoading && !stats} />
              </CardContent>
            </Card>

            <Card className="bg-white rounded-2xl border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Sipariş Durum Dağılımı
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading && !stats ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <StatusDonut statusBreakdown={stats?.statusBreakdown ?? {}} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Ödeme yöntemleri — bugün ve tüm zamanlar yan yana */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="bg-white rounded-2xl border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Ödeme Yöntemleri · Bugün
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading && !stats ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <PaymentBreakdown
                    data={stats?.paymentToday}
                    total={totalPaymentToday}
                    emptyText="Bugün Trendyol siparişi yok"
                    totalLabel="Bugünkü Toplam"
                    totalColor="text-emerald-700"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="bg-white rounded-2xl border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Ödeme Yöntemleri · Tüm Zamanlar
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading && !stats ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <PaymentBreakdown
                    data={stats?.paymentAll}
                    total={totalPaymentAll}
                    emptyText="Henüz Trendyol siparişi yok"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* 7 günlük trend + Top ürünler */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="bg-white rounded-2xl border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Son 7 Gün Trendyol Trendi
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading && !stats ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <DailyTrend data={stats?.dailyTrend ?? []} />
                )}
              </CardContent>
            </Card>

            <Card className="bg-white rounded-2xl border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  En Çok Satan Ürünler (Trendyol)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading && !stats ? (
                  <Skeleton className="h-48 w-full" />
                ) : stats?.topProducts.length ? (
                  <ul className="space-y-2.5">
                    {stats.topProducts.map((p, i) => (
                      <li
                        key={p.name}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-orange-100 text-orange-700 text-xs font-bold shrink-0">
                            {i + 1}
                          </span>
                          <span className="truncate font-medium text-gray-800">
                            {p.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-gray-500">×{p.quantity}</span>
                          <span className="text-sm font-bold text-gray-900 w-24 text-right">
                            {formatCurrency(p.revenue)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={ShoppingBag} text="Henüz veri yok" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Son Trendyol siparişleri */}
          <Card className="bg-white rounded-2xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Son Trendyol Siparişleri
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-48 w-full" />
              ) : stats?.recentOrders.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 border-b">
                      <tr>
                        <th className="text-left py-2 px-2 font-medium">Sipariş</th>
                        <th className="text-left py-2 px-2 font-medium">Müşteri</th>
                        <th className="text-left py-2 px-2 font-medium">Ref</th>
                        <th className="text-left py-2 px-2 font-medium">Ödeme</th>
                        <th className="text-left py-2 px-2 font-medium">Durum</th>
                        <th className="text-right py-2 px-2 font-medium">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentOrders.map((o) => {
                        const cfg = statusConfig[o.status as Order["status"]];
                        return (
                          <tr key={o.id} className="border-b last:border-b-0 hover:bg-gray-50">
                            <td className="py-2.5 px-2 font-semibold text-gray-900">
                              #{o.orderNumber}
                            </td>
                            <td className="py-2.5 px-2 text-gray-700">{o.customerName}</td>
                            <td className="py-2.5 px-2 text-xs text-gray-500 font-mono">
                              {o.externalRef ?? "—"}
                            </td>
                            <td className="py-2.5 px-2">
                              <Badge variant="secondary" className="text-xs">
                                {o.paymentMethod}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-2">
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border ${cfg?.bg ?? "bg-gray-50"} ${cfg?.color ?? "text-gray-600"}`}
                              >
                                {cfg?.label ?? o.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right font-bold text-gray-900">
                              {formatCurrency(o.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={XCircle} text="Henüz Trendyol siparişi yok" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Yardımcı bileşenler ─────────────────────────────────────────────────

function TrendyolHeader({
  isLoading,
  onRefresh,
  lastUpdated,
}: {
  isLoading: boolean;
  onRefresh: () => void;
  lastUpdated: Date | null;
}) {
  return (
    <header className="shrink-0 bg-white border-b px-8 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
          <Store className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Trendyol Dashboard</h1>
          <p
            className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5"
            suppressHydrationWarning
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date().toLocaleDateString("tr-TR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {lastUpdated && (
              <span className="text-xs text-gray-400 ml-2" suppressHydrationWarning>
                · son güncelleme {lastUpdated.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
        className="gap-2 self-start md:self-auto"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        Yenile
      </Button>
    </header>
  );
}

function HealthCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "blue" | "slate";
  loading: boolean;
}) {
  const tones = {
    emerald: { bg: "bg-emerald-100", text: "text-emerald-600" },
    blue: { bg: "bg-blue-100", text: "text-blue-600" },
    slate: { bg: "bg-slate-100", text: "text-slate-600" },
  }[tone];
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border p-4">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border p-4 flex items-center gap-4">
      <div className={`rounded-xl p-2.5 ${tones.bg}`}>
        <Icon className={`h-5 w-5 ${tones.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold leading-tight text-gray-900">{value}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
      </div>
    </div>
  );
}

function HourlyChart({
  data,
  loading,
}: {
  data?: TrendyolDashboardStats["hourlyToday"];
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!data || data.every((d) => d.orders === 0)) {
    return <EmptyState icon={Flame} text="Bugün henüz Trendyol siparişi yok" />;
  }
  const max = Math.max(...data.map((d) => d.orders), 1);
  return (
    <div className="flex items-end gap-1 h-48 px-1">
      {data.map((d) => {
        const h = (d.orders / max) * 100;
        const isPeak = d.orders === max && max > 0;
        return (
          <div
            key={d.hour}
            className="flex-1 flex flex-col items-center gap-1 group min-w-0"
            title={`${d.hour}:00 — ${d.orders} sipariş · ${formatCurrency(d.revenue)}`}
          >
            <div
              className={`w-full rounded-t-md transition-all ${
                isPeak ? "bg-orange-500" : "bg-orange-300 group-hover:bg-orange-400"
              }`}
              style={{ height: `${Math.max(h, 2)}%` }}
            />
            <span className="text-[9px] text-gray-400 font-mono">
              {String(d.hour).padStart(2, "0")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DailyTrend({ data }: { data: TrendyolDashboardStats["dailyTrend"] }) {
  if (!data.length || data.every((d) => d.orders === 0)) {
    return <EmptyState icon={TrendingUp} text="Son 7 günde Trendyol siparişi yok" />;
  }
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const w = (d.revenue / max) * 100;
        return (
          <div key={d.date} className="flex items-center gap-3 text-sm">
            <span className="text-xs text-gray-500 w-28 shrink-0">{d.date}</span>
            <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-md transition-all"
                style={{ width: `${Math.max(w, 1)}%` }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-gray-800">
                {d.orders} sipariş
              </span>
            </div>
            <span className="text-sm font-bold text-gray-900 w-24 text-right">
              {formatCurrency(d.revenue)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
