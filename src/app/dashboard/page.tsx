"use client";

import Link from "next/link";
import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { useSearchParams } from "next/navigation";
import { getDashboardStats, type DashboardStats } from "@/actions/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { type Order } from "@/types";
import {
  ShoppingBag,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  Bike,
  Users,
  UtensilsCrossed,
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
  Building,
  RefreshCw,
  MapPin,
  Star,
  ArrowUpRight,
  ArrowRight,
  Flame,
  Crown,
  Package,
  CircleDollarSign,
  Activity,
  CalendarDays,
  BarChart3,
  Receipt,
} from "lucide-react";

// ─── Sabitler ──────────────────────────────────────────────────────────────────

const statusConfig: Record<
  Order["status"],
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  pending: { label: "Beklemede", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
  preparing: { label: "Hazırlanıyor", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: ClipboardList },
  "on-the-way": { label: "Yolda", color: "text-violet-700", bg: "bg-violet-50 border-violet-200", icon: Bike },
  delivered: { label: "Teslim Edildi", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "İptal", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: ClipboardList },
};

const PAYMENT_LABELS: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  cash: { label: "Nakit", icon: Banknote, color: "text-emerald-700", bg: "bg-emerald-100" },
  card: { label: "Kredi Kartı", icon: CreditCard, color: "text-blue-700", bg: "bg-blue-100" },
  online: { label: "Online", icon: Smartphone, color: "text-violet-700", bg: "bg-violet-100" },
  meal_card: { label: "Yemek Kartı", icon: Wallet, color: "text-orange-700", bg: "bg-orange-100" },
  iban: { label: "IBAN/Havale", icon: Building, color: "text-cyan-700", bg: "bg-cyan-100" },
};

const CATEGORY_COLORS: Record<string, { from: string; to: string; text: string; bg: string }> = {
  kebap: { from: "from-red-500", to: "to-orange-500", text: "text-red-700", bg: "bg-red-100" },
  pide: { from: "from-amber-500", to: "to-yellow-500", text: "text-amber-700", bg: "bg-amber-100" },
  lahmacun: { from: "from-orange-500", to: "to-red-500", text: "text-orange-700", bg: "bg-orange-100" },
  durum: { from: "from-emerald-500", to: "to-green-500", text: "text-emerald-700", bg: "bg-emerald-100" },
  kilo: { from: "from-blue-500", to: "to-indigo-500", text: "text-blue-700", bg: "bg-blue-100" },
  corba: { from: "from-yellow-500", to: "to-amber-500", text: "text-yellow-700", bg: "bg-yellow-100" },
  tatli: { from: "from-pink-500", to: "to-rose-500", text: "text-pink-700", bg: "bg-pink-100" },
  icecek: { from: "from-cyan-500", to: "to-teal-500", text: "text-cyan-700", bg: "bg-cyan-100" },
};

const DONUT_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  preparing: "#3b82f6",
  "on-the-way": "#8b5cf6",
  delivered: "#10b981",
  cancelled: "#ef4444",
};

// ─── Ana Sayfa ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getDashboardStats();
      setStats(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const handleFocus = () => loadStats();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadStats]);

  const todayTrend = useMemo(() => {
    if (!stats?.dailyTrend || stats.dailyTrend.length < 2) return null;
    const today = stats.dailyTrend[stats.dailyTrend.length - 1];
    const yesterday = stats.dailyTrend[stats.dailyTrend.length - 2];
    if (!yesterday || yesterday.revenue === 0) return null;
    const pct = ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100;
    return { pct: Math.round(pct), up: pct >= 0 };
  }, [stats?.dailyTrend]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="shrink-0 bg-white border-b px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5" suppressHydrationWarning>
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date().toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={isLoading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </header>

      {/* ── Scrollable Content ───────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50/60">
        <div className="px-8 py-6 space-y-6">

          {/* ── KPI Cards ──────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {isLoading ? (
              [...Array(4)].map((_, i) => <KPICardSkeleton key={i} />)
            ) : (
              <>
                <KPICard
                  label="Bugünkü Sipariş"
                  value={String(stats?.todayOrderCount ?? 0)}
                  icon={ShoppingBag}
                  color="blue"
                  trend={todayTrend}
                  trendLabel="dünkü ciroya göre"
                />
                <KPICard
                  label="Bugünkü Ciro"
                  value={formatCurrency(stats?.todayRevenue ?? 0)}
                  icon={CircleDollarSign}
                  color="emerald"
                />
                <KPICard
                  label="Aktif Sipariş"
                  value={String(stats?.activeOrderCount ?? 0)}
                  icon={Flame}
                  color="amber"
                />
                <KPICard
                  label="Toplam Ciro"
                  value={formatCurrency(stats?.totalRevenue ?? 0)}
                  icon={TrendingUp}
                  color="violet"
                />
              </>
            )}
          </div>

          {/* ── Mini Stats ─────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-5">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border p-4 flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                </div>
              ))
            ) : (
              <>
                <MiniStat icon={Package} label="Toplam Sipariş" value={String(stats?.totalOrderCount ?? 0)} color="indigo" />
                <MiniStat icon={Users} label="Toplam Müşteri" value={String(stats?.totalCustomerCount ?? 0)} color="pink" />
                <MiniStat icon={UtensilsCrossed} label="Toplam Ürün" value={String(stats?.totalProductCount ?? 0)} color="amber" />
              </>
            )}
          </div>

          {/* ── Tab-specific Content ───────────────────────── */}
          {activeTab === "overview" && <OverviewTab stats={stats} isLoading={isLoading} />}
          {activeTab === "orders" && <OrdersTab stats={stats} isLoading={isLoading} />}
          {activeTab === "payments" && <PaymentsTab stats={stats} isLoading={isLoading} />}
          {activeTab === "products" && <ProductsTab stats={stats} isLoading={isLoading} />}
          {activeTab === "addresses" && <AddressesTab stats={stats} isLoading={isLoading} />}

        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ════════════════════════════════════════════════════════════════════════════════

const OverviewTab = memo(function OverviewTab({
  stats,
  isLoading,
}: {
  stats: DashboardStats | null;
  isLoading: boolean;
}) {
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
                <Receipt className="h-4 w-4 text-emerald-600" />
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

// ════════════════════════════════════════════════════════════════════════════════
// ORDERS TAB
// ════════════════════════════════════════════════════════════════════════════════

const OrdersTab = memo(function OrdersTab({
  stats,
  isLoading,
}: {
  stats: DashboardStats | null;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Aktif Siparişler */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-orange-100 flex items-center justify-center">
                <Flame className="h-4 w-4 text-orange-600" />
              </div>
              Aktif Siparişler
            </CardTitle>
            <Badge variant="outline" className="text-xs font-bold bg-orange-50 text-orange-700 border-orange-200 px-3 py-1">
              {stats?.activeOrderCount ?? 0} aktif
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : (stats?.activeOrders?.length ?? 0) === 0 ? (
            <EmptyState icon={CheckCircle2} text="Tüm siparişler tamamlandı" subtext="Aktif sipariş bulunmuyor" color="emerald" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {stats?.activeOrders.map((order) => {
                const cfg = statusConfig[order.status as Order["status"]];
                const Icon = cfg?.icon ?? Clock;
                return (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="group flex items-center justify-between rounded-xl border p-4 transition-all hover:border-gray-300 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-xl ${cfg?.bg} border flex items-center justify-center shrink-0`}>
                        <Icon className={`h-4.5 w-4.5 ${cfg?.color}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">#{order.orderNumber}</span>
                          <span className="text-sm text-gray-500 truncate">{order.customerName}</span>
                        </div>
                        <span className={`text-xs font-medium ${cfg?.color}`}>{cfg?.label}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(order.total)}</span>
                      <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// PAYMENTS TAB
// ════════════════════════════════════════════════════════════════════════════════

const PaymentsTab = memo(function PaymentsTab({
  stats,
  isLoading,
}: {
  stats: DashboardStats | null;
  isLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CircleDollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            Bugünkü Ödeme Dağılımı
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
          ) : (
            <PaymentBreakdown data={stats?.paymentBreakdown} total={stats?.todayRevenue ?? 0} emptyText="Bugün henüz sipariş yok" totalLabel="Bugün Toplam" totalColor="text-emerald-600" />
          )}
        </CardContent>
      </Card>

      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-violet-600" />
            </div>
            Toplam Ödeme Dağılımı
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
          ) : (
            <PaymentBreakdown data={stats?.paymentBreakdownAll} total={stats?.totalRevenue ?? 0} totalLabel="Genel Toplam" totalColor="text-violet-600" />
          )}
        </CardContent>
      </Card>
    </div>
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// PRODUCTS TAB
// ════════════════════════════════════════════════════════════════════════════════

const ProductsTab = memo(function ProductsTab({
  stats,
  isLoading,
}: {
  stats: DashboardStats | null;
  isLoading: boolean;
}) {
  const topMax = stats?.topProducts?.[0]?.quantity ?? 1;
  const catMax = useMemo(
    () => Math.max(...(stats?.categoryBreakdown?.map((c) => c.revenue) ?? []), 1),
    [stats?.categoryBreakdown],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* En çok satanlar */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <Crown className="h-4 w-4 text-amber-600" />
            </div>
            En Çok Satan Ürünler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : (stats?.topProducts?.length ?? 0) === 0 ? (
            <EmptyState icon={Crown} text="Henüz veri yok" />
          ) : (
            stats?.topProducts.map((product, i) => {
              const pct = (product.quantity / topMax) * 100;
              return (
                <div key={product.name} className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-amber-50/50">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold shrink-0 ${
                    i === 0 ? "bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-sm" :
                    i === 1 ? "bg-linear-to-br from-gray-300 to-gray-400 text-white" :
                    i === 2 ? "bg-linear-to-br from-orange-300 to-amber-400 text-white" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">{product.name}</span>
                      <span className="text-sm font-bold text-gray-900 ml-3 shrink-0">{formatCurrency(product.revenue)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-amber-400 to-orange-400 transition-all duration-700"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 shrink-0 font-medium w-16 text-right">{product.quantity} adet</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Kategori dağılımı */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-rose-100 flex items-center justify-center">
              <UtensilsCrossed className="h-4 w-4 text-rose-600" />
            </div>
            Kategori Dağılımı
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : (stats?.categoryBreakdown?.length ?? 0) === 0 ? (
            <EmptyState icon={UtensilsCrossed} text="Henüz veri yok" />
          ) : (
            stats?.categoryBreakdown.map((cat) => {
              const pct = (cat.revenue / catMax) * 100;
              const catColor = CATEGORY_COLORS[cat.category];
              return (
                <div key={cat.category} className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-gray-50">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${catColor?.bg ?? "bg-gray-100"}`}>
                    <div className={`h-3 w-3 rounded-full bg-linear-to-r ${catColor?.from ?? "from-gray-400"} ${catColor?.to ?? "to-gray-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{cat.label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500 font-medium">{cat.quantity} adet</span>
                        <span className="text-sm font-bold text-gray-900">{formatCurrency(cat.revenue)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-linear-to-r ${catColor?.from ?? "from-gray-400"} ${catColor?.to ?? "to-gray-500"} transition-all duration-700`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// ADDRESSES TAB
// ════════════════════════════════════════════════════════════════════════════════

const AddressesTab = memo(function AddressesTab({
  stats,
  isLoading,
}: {
  stats: DashboardStats | null;
  isLoading: boolean;
}) {
  const addrMax = stats?.topAddresses?.[0]?.orderCount ?? 1;
  const menuMax = stats?.menuPreferences?.[0]?.quantity ?? 1;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* Adresler */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-rose-100 flex items-center justify-center">
              <MapPin className="h-4 w-4 text-rose-600" />
            </div>
            En Çok Sipariş Veren Adresler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : (stats?.topAddresses?.length ?? 0) === 0 ? (
            <EmptyState icon={MapPin} text="Henüz veri yok" />
          ) : (
            stats?.topAddresses.map((addr, i) => {
              const pct = (addr.orderCount / addrMax) * 100;
              return (
                <div key={i} className="rounded-xl p-4 border transition-colors hover:bg-rose-50/30 hover:border-rose-200">
                  <div className="flex items-start gap-3">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold shrink-0 ${
                      i < 3 ? "bg-linear-to-br from-rose-400 to-pink-500 text-white shadow-sm" : "bg-gray-100 text-gray-500"
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 leading-snug" title={addr.address}>{addr.address}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-gray-500 flex items-center gap-1.5 font-medium">
                          <ShoppingBag className="h-3.5 w-3.5" /> {addr.orderCount} sipariş
                        </span>
                        <span className="text-xs font-bold text-rose-600">{formatCurrency(addr.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2.5">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-rose-400 to-pink-400 transition-all duration-700"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Menüler */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <Star className="h-4 w-4 text-amber-600" />
            </div>
            En Çok Tercih Edilen Menüler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : (stats?.menuPreferences?.length ?? 0) === 0 ? (
            <EmptyState icon={Star} text="Henüz veri yok" />
          ) : (
            stats?.menuPreferences.map((item, i) => {
              const pct = (item.quantity / menuMax) * 100;
              const catColor = CATEGORY_COLORS[item.category];
              return (
                <div key={item.name} className="rounded-xl p-4 border transition-colors hover:bg-amber-50/30 hover:border-amber-200">
                  <div className="flex items-start gap-3">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold shrink-0 ${
                      i < 3 ? "bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-sm" : "bg-gray-100 text-gray-500"
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                        <Badge variant="outline" className={`text-[10px] font-medium ${catColor?.text ?? "text-gray-600"} ${catColor?.bg ?? "bg-gray-50"} border-0`}>
                          {item.categoryLabel}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="text-xs text-gray-500 font-medium">{item.orderCount} sipariş</span>
                        <span className="text-xs text-gray-500 font-medium">{item.quantity} adet</span>
                        <span className="text-xs font-bold text-amber-600">{formatCurrency(item.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2.5">
                        <div
                          className={`h-full rounded-full bg-linear-to-r ${catColor?.from ?? "from-gray-400"} ${catColor?.to ?? "to-gray-500"} transition-all duration-700`}
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ════════════════════════════════════════════════════════════════════════════════

// ─── KPI Card ──────────────────────────────────────────────────────────────────

const COLOR_MAP = {
  blue: { iconBg: "bg-blue-100", iconText: "text-blue-600", border: "border-l-blue-500" },
  emerald: { iconBg: "bg-emerald-100", iconText: "text-emerald-600", border: "border-l-emerald-500" },
  amber: { iconBg: "bg-amber-100", iconText: "text-amber-600", border: "border-l-amber-500" },
  violet: { iconBg: "bg-violet-100", iconText: "text-violet-600", border: "border-l-violet-500" },
} as const;

const KPICard = memo(function KPICard({
  label,
  value,
  icon: Icon,
  color,
  trend,
  trendLabel,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: keyof typeof COLOR_MAP;
  trend?: { pct: number; up: boolean } | null;
  trendLabel?: string;
}) {
  const c = COLOR_MAP[color];
  return (
    <Card className={`bg-white rounded-2xl border shadow-sm border-l-4 ${c.border} hover:shadow-md transition-shadow`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
            <p className="text-2xl font-bold tracking-tight text-gray-900">{value}</p>
            {trend && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
                  trend.up ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
                }`}>
                  {trend.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(trend.pct)}%
                </span>
                {trendLabel && <span className="text-[10px] text-gray-400">{trendLabel}</span>}
              </div>
            )}
          </div>
          <div className={`h-11 w-11 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${c.iconText}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

function KPICardSkeleton() {
  return (
    <Card className="bg-white rounded-2xl border shadow-sm border-l-4 border-l-gray-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
          <Skeleton className="h-11 w-11 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mini Stat ─────────────────────────────────────────────────────────────────

const MINI_COLOR_MAP = {
  indigo: { bg: "bg-indigo-100", text: "text-indigo-600" },
  pink: { bg: "bg-pink-100", text: "text-pink-600" },
  amber: { bg: "bg-amber-100", text: "text-amber-600" },
} as const;

const MiniStat = memo(function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: keyof typeof MINI_COLOR_MAP;
}) {
  const c = MINI_COLOR_MAP[color];
  return (
    <div className="bg-white rounded-2xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
      <div className={`rounded-xl p-2.5 ${c.bg}`}>
        <Icon className={`h-4.5 w-4.5 ${c.text}`} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold leading-tight text-gray-900">{value}</p>
      </div>
    </div>
  );
});

// ─── Status Donut ──────────────────────────────────────────────────────────────

const StatusDonut = memo(function StatusDonut({
  statusBreakdown,
}: {
  statusBreakdown: Record<string, number>;
}) {
  const { segments, total, gradient } = useMemo(() => {
    const entries = Object.entries(statusBreakdown).filter(([, count]) => count > 0);
    const t = entries.reduce((s, [, c]) => s + c, 0);
    if (t === 0) return { segments: [], total: 0, gradient: "" };

    let cumPct = 0;
    const segs = entries.map(([status, count]) => {
      const pct = (count / t) * 100;
      const start = cumPct;
      cumPct += pct;
      return { status, count, pct, start, end: cumPct, color: DONUT_COLORS[status] ?? "#94a3b8" };
    });
    return { segments: segs, total: t, gradient: segs.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ") };
  }, [statusBreakdown]);

  if (total === 0) return <EmptyState icon={Activity} text="Henüz veri yok" />;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <div
          className="h-40 w-40 rounded-full"
          style={{
            background: `conic-gradient(${gradient})`,
            maskImage: "radial-gradient(circle, transparent 55%, black 56%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 55%, black 56%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="text-3xl font-bold text-gray-900">{total}</span>
          <span className="text-xs text-gray-400 font-medium">toplam</span>
        </div>
      </div>

      <div className="w-full space-y-2.5">
        {segments.map((s) => {
          const cfg = statusConfig[s.status as Order["status"]];
          return (
            <div key={s.status} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm text-gray-700 font-medium">{cfg?.label ?? s.status}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-900">{s.count}</span>
                <span className="text-xs text-gray-400 w-12 text-right font-medium">{s.pct.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── Payment Breakdown ─────────────────────────────────────────────────────────

const PaymentBreakdown = memo(function PaymentBreakdown({
  data,
  total,
  emptyText,
  totalLabel = "Toplam",
  totalColor = "text-gray-900",
}: {
  data?: Record<string, number>;
  total: number;
  emptyText?: string;
  totalLabel?: string;
  totalColor?: string;
}) {
  const allZero = data && Object.values(data).every((v) => v === 0);

  return (
    <div className="space-y-4">
      {Object.entries(data ?? {}).map(([method, amount]) => {
        const config = PAYMENT_LABELS[method];
        if (!config) return null;
        const pct = total > 0 ? (amount / total) * 100 : 0;
        const PayIcon = config.icon;
        return (
          <div key={method} className="flex items-center gap-4">
            <div className={`rounded-xl p-2.5 ${config.bg}`}>
              <PayIcon className={`h-4 w-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{config.label}</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(amount)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${config.bg} transition-all duration-700`}
                  style={{ width: `${Math.max(pct, 1)}%`, opacity: 0.8 }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-400 w-12 text-right font-medium">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
      {allZero && emptyText && (
        <p className="text-sm text-gray-400 text-center py-6">{emptyText}</p>
      )}
      <Separator />
      <div className="flex items-center justify-between pt-1">
        <span className="text-sm font-bold text-gray-900">{totalLabel}</span>
        <span className={`text-base font-bold ${totalColor}`}>{formatCurrency(total)}</span>
      </div>
    </div>
  );
});

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  text,
  subtext,
  color = "gray",
}: {
  icon: React.ElementType;
  text: string;
  subtext?: string;
  color?: string;
}) {
  const bgClass = color === "emerald" ? "bg-emerald-50" : "bg-gray-100";
  const iconClass = color === "emerald" ? "text-emerald-400" : "text-gray-400";

  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className={`h-14 w-14 rounded-2xl ${bgClass} flex items-center justify-center mb-3`}>
        <Icon className={`h-7 w-7 ${iconClass}`} />
      </div>
      <p className="text-sm font-medium text-gray-600">{text}</p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}
