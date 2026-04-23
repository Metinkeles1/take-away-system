import { memo, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { type Order } from "@/types";
import { type DashboardStats } from "@/actions/dashboard";
import { BarChart3, Activity, ClipboardList, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { statusConfig, PAYMENT_LABELS } from "@/app/dashboard/constants/dashboardConfig";
import { StatusDonut } from "../StatusDonut";
import { PaymentBreakdown } from "../PaymentBreakdown";
import { EmptyState } from "../EmptyState";

interface OverviewTabProps {
  stats: DashboardStats | null;
  isLoading: boolean;
}

export const OverviewTab = memo(function OverviewTab({
  stats,
  isLoading,
}: OverviewTabProps) {
  const weeklyTotal = useMemo(
    () => stats?.dailyTrend?.reduce((s, d) => s + d.revenue, 0) ?? 0,
    [stats?.dailyTrend],
  );
  const trendMax = useMemo(
    () => Math.max(...(stats?.dailyTrend?.map((d) => d.revenue) ?? []), 1),
    [stats?.dailyTrend],
  );

  return (
    <div className="space-y-6">
      {/* Row 1: Trend + Durum */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* Haftalık Trend */}
        <Card className="xl:col-span-3 bg-white rounded-2xl border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-indigo-600" />
                </div>
                Son 7 Gün Trendi
              </CardTitle>
              {stats && (
                <Badge variant="secondary" className="text-xs font-medium">
                  Haftalık: {formatCurrency(weeklyTotal)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <div className="space-y-3">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}</div>
            ) : (
              stats?.dailyTrend.map((day, idx) => {
                const pct = (day.revenue / trendMax) * 100;
                const isToday = idx === stats.dailyTrend.length - 1;
                return (
                  <div
                    key={day.date}
                    className={`flex items-center gap-4 rounded-xl px-4 py-2.5 transition-colors ${
                      isToday ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className={`text-sm w-24 shrink-0 font-medium ${isToday ? "text-indigo-700 font-semibold" : "text-gray-500"}`}>
                      {isToday ? "📍 Bugün" : day.date}
                    </span>
                    <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                      <div
                        className={`h-full rounded-lg transition-all duration-700 ease-out ${
                          isToday
                            ? "bg-linear-to-r from-indigo-500 to-violet-500"
                            : "bg-linear-to-r from-gray-300 to-gray-400"
                        }`}
                        style={{ width: `${Math.max(pct, 5)}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-3">
                        <span className={`text-xs font-medium ${pct > 35 ? "text-white" : "text-gray-600"}`}>
                          {day.orders} sipariş
                        </span>
                        <span className={`text-xs font-bold ${pct > 55 ? "text-white" : "text-gray-700"}`}>
                          {formatCurrency(day.revenue)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Sipariş Durumları */}
        <Card className="xl:col-span-2 bg-white rounded-2xl border shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center">
                <Activity className="h-4 w-4 text-violet-600" />
              </div>
              Sipariş Durumları
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center gap-6 py-4">
                <Skeleton className="h-36 w-36 rounded-full" />
                <div className="space-y-3 w-full">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
              </div>
            ) : (
              <StatusDonut statusBreakdown={stats?.statusBreakdown ?? {}} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Son Siparişler + Ödeme Özeti */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Son Siparişler */}
        <Card className="bg-white rounded-2xl border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center">
                  <ClipboardList className="h-4 w-4 text-slate-600" />
                </div>
                Son Siparişler
              </CardTitle>
              <Link href="/orders">
                <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                  Tümünü Gör <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
            ) : (stats?.recentOrders?.length ?? 0) === 0 ? (
              <EmptyState icon={ClipboardList} text="Henüz sipariş yok" />
            ) : (
              stats?.recentOrders.map((order) => {
                const cfg = statusConfig[order.status as Order["status"]];
                const payCfg = PAYMENT_LABELS[order.paymentMethod];
                return (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="group flex items-center justify-between rounded-xl border p-4 transition-all hover:border-gray-300 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-gray-900">#{order.orderNumber}</span>
                        <span className="text-gray-500 truncate">{order.customerName}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <span>{formatDate(order.createdAt)}</span>
                        {payCfg && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <payCfg.icon className="h-3 w-3" />
                              {payCfg.label}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(order.total)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${cfg?.bg} ${cfg?.color}`}>
                        {cfg?.label}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Bugünkü Ödeme Özeti */}
        <Card className="bg-white rounded-2xl border shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Activity className="h-4 w-4 text-emerald-600" />
              </div>
              Bugünkü Ödeme Dağılımı
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
            ) : (
              <PaymentBreakdown data={stats?.paymentBreakdown} total={stats?.todayRevenue ?? 0} emptyText="Bugün henüz sipariş yok" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
