"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
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
  Target,
  Package,
  CircleDollarSign,
  Activity,
  CalendarDays,
} from "lucide-react";

// ─── Sabitler ──────────────────────────────────────────────────────────────────
const statusConfig: Record<
  Order["status"],
  { label: string; color: string; bg: string; dotColor: string; icon: React.ElementType }
> = {
  pending: { label: "Beklemede", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dotColor: "bg-amber-500", icon: Clock },
  preparing: { label: "Hazırlanıyor", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", dotColor: "bg-blue-500", icon: ClipboardList },
  "on-the-way": { label: "Yolda", color: "text-violet-700", bg: "bg-violet-50 border-violet-200", dotColor: "bg-violet-500", icon: Bike },
  delivered: { label: "Teslim Edildi", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dotColor: "bg-emerald-500", icon: CheckCircle2 },
  cancelled: { label: "İptal", color: "text-red-700", bg: "bg-red-50 border-red-200", dotColor: "bg-red-500", icon: ClipboardList },
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

// ─── Ana Sayfa ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
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
    <div className="h-full flex flex-col overflow-hidden bg-gray-50/80">
      {/* ── Top Header Bar ──────────────────────────────────────── */}
      <header className="shrink-0 bg-white border-b px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-linear-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <Activity className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Dashboard</h1>
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3" />
              {new Date().toLocaleDateString("tr-TR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadStats}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </header>

      {/* ── Scrollable Content ──────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-400">
          {/* ── KPI Cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {isLoading ? (
              [...Array(4)].map((_, i) => <KPICardSkeleton key={i} />)
            ) : (
              <>
                <KPICard
                  label="Bugünkü Sipariş"
                  value={String(stats?.todayOrderCount ?? 0)}
                  icon={ShoppingBag}
                  iconColor="text-blue-600"
                  iconBg="bg-blue-50"
                  borderColor="border-l-blue-500"
                />
                <KPICard
                  label="Bugünkü Ciro"
                  value={formatCurrency(stats?.todayRevenue ?? 0)}
                  icon={CircleDollarSign}
                  iconColor="text-emerald-600"
                  iconBg="bg-emerald-50"
                  borderColor="border-l-emerald-500"
                  trend={todayTrend}
                  subtitle="dünkü ciroya göre"
                />
                <KPICard
                  label="Aktif Sipariş"
                  value={String(stats?.activeOrderCount ?? 0)}
                  icon={Flame}
                  iconColor="text-amber-600"
                  iconBg="bg-amber-50"
                  borderColor="border-l-amber-500"
                />
                <KPICard
                  label="Toplam Ciro"
                  value={formatCurrency(stats?.totalRevenue ?? 0)}
                  icon={TrendingUp}
                  iconColor="text-violet-600"
                  iconBg="bg-violet-50"
                  borderColor="border-l-violet-500"
                />
              </>
            )}
          </div>

          {/* ── Mini Stats Row ────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="rounded-xl bg-white border p-3.5 flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-10" />
                  </div>
                </div>
              ))
            ) : (
              <>
                <MiniStat icon={Package} label="Toplam Sipariş" value={String(stats?.totalOrderCount ?? 0)} color="text-indigo-600" bg="bg-indigo-50" />
                <MiniStat icon={Users} label="Toplam Müşteri" value={String(stats?.totalCustomerCount ?? 0)} color="text-pink-600" bg="bg-pink-50" />
                <MiniStat icon={UtensilsCrossed} label="Toplam Ürün" value={String(stats?.totalProductCount ?? 0)} color="text-amber-600" bg="bg-amber-50" />
              </>
            )}
          </div>

          {/* ── Row 1: Haftalık Trend + Sipariş Durumları ───── */}
          <div className="grid gap-4 xl:grid-cols-5">
            {/* Haftalık Trend */}
            <Card className="xl:col-span-3 border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-indigo-50 flex items-center justify-center">
                      <Target className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                    Son 7 Gün Trendi
                  </CardTitle>
                  {stats && (
                    <span className="text-xs text-muted-foreground font-medium">
                      Haftalık: {formatCurrency(stats.dailyTrend.reduce((s, d) => s + d.revenue, 0))}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {stats?.dailyTrend.map((day, idx) => {
                      const max = Math.max(...(stats.dailyTrend.map((d) => d.revenue)), 1);
                      const pct = (day.revenue / max) * 100;
                      const isToday = idx === stats.dailyTrend.length - 1;
                      return (
                        <div
                          key={day.date}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                            isToday ? "bg-indigo-50/70 ring-1 ring-indigo-200" : "hover:bg-gray-50"
                          }`}
                        >
                          <span className={`text-xs w-20 shrink-0 text-right font-medium ${isToday ? "text-indigo-700 font-bold" : "text-gray-500"}`}>
                            {isToday ? "📍 Bugün" : day.date}
                          </span>
                          <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                            <div
                              className={`h-full rounded-lg transition-all duration-700 ease-out ${
                                isToday
                                  ? "bg-linear-to-r from-indigo-400 via-blue-500 to-violet-500"
                                  : "bg-linear-to-r from-gray-300 to-gray-400"
                              }`}
                              style={{ width: `${Math.max(pct, 4)}%` }}
                            />
                            <div className="absolute inset-0 flex items-center justify-between px-3">
                              <span className={`text-[11px] font-medium ${pct > 40 ? "text-white" : "text-gray-600"}`}>
                                {day.orders} sipariş
                              </span>
                              <span className={`text-[11px] font-bold ${pct > 60 ? "text-white" : "text-gray-700"}`}>
                                {formatCurrency(day.revenue)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sipariş Durumları Donut */}
            <Card className="xl:col-span-2 border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-violet-50 flex items-center justify-center">
                    <Activity className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  Sipariş Durumları
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex flex-col items-center gap-6 py-4">
                    <Skeleton className="h-36 w-36 rounded-full" />
                    <div className="space-y-2 w-full">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
                  </div>
                ) : (
                  <StatusDonut statusBreakdown={stats?.statusBreakdown ?? {}} totalOrders={stats?.totalOrderCount ?? 0} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Row 2: Aktif Siparişler + Son Siparişler ──── */}
          <div className="grid gap-4 xl:grid-cols-2">
            {/* Aktif Siparişler */}
            <Card className="border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-orange-50 flex items-center justify-center">
                    <Flame className="h-3.5 w-3.5 text-orange-600" />
                  </div>
                  Aktif Siparişler
                </CardTitle>
                <Badge variant="outline" className="text-xs font-bold bg-orange-50 text-orange-700 border-orange-200">
                  {stats?.activeOrderCount ?? 0} aktif
                </Badge>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
                ) : (stats?.activeOrders?.length ?? 0) === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                      <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                    </div>
                    <p className="text-sm font-medium">Tüm siparişler tamamlandı</p>
                    <p className="text-xs text-gray-400 mt-1">Aktif sipariş bulunmuyor</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stats?.activeOrders.map((order) => {
                      const cfg = statusConfig[order.status as Order["status"]];
                      const Icon = cfg?.icon ?? Clock;
                      return (
                        <Link
                          key={order.id}
                          href={`/orders/${order.id}`}
                          className="group flex items-center justify-between rounded-xl border p-3 transition-all hover:shadow-md hover:-translate-y-0.5"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`h-9 w-9 rounded-lg ${cfg?.bg} border flex items-center justify-center shrink-0`}>
                              <Icon className={`h-4 w-4 ${cfg?.color}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">#{order.orderNumber}</span>
                                <span className="text-sm text-gray-500 truncate">{order.customerName}</span>
                              </div>
                              <span className={`text-[11px] font-medium ${cfg?.color}`}>{cfg?.label}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold">{formatCurrency(order.total)}</span>
                            <ArrowUpRight className="h-3.5 w-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Son Siparişler */}
            <Card className="border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center">
                    <ClipboardList className="h-3.5 w-3.5 text-slate-600" />
                  </div>
                  Son Siparişler
                </CardTitle>
                <Link href="/orders">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                    Tümünü Gör <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
                ) : (stats?.recentOrders?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Henüz sipariş yok</p>
                ) : (
                  <div className="space-y-2">
                    {stats?.recentOrders.map((order) => {
                      const cfg = statusConfig[order.status as Order["status"]];
                      const payCfg = PAYMENT_LABELS[order.paymentMethod];
                      return (
                        <Link
                          key={order.id}
                          href={`/orders/${order.id}`}
                          className="group flex items-center justify-between rounded-xl border border-transparent p-3 transition-all hover:border-gray-200 hover:shadow-md hover:-translate-y-0.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-bold">#{order.orderNumber}</span>
                              <span className="text-gray-500 truncate">{order.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
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
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-sm font-bold">{formatCurrency(order.total)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cfg?.bg} ${cfg?.color}`}>
                              {cfg?.label}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Row 3: Ödeme Dağılımları ──────────────────── */}
          <div className="grid gap-4 xl:grid-cols-2">
            <PaymentCard
              title="Bugünkü Ödeme Dağılımı"
              icon={CircleDollarSign}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
              data={stats?.paymentBreakdown}
              total={stats?.todayRevenue ?? 0}
              totalLabel="Bugün Toplam"
              totalColor="text-emerald-600"
              isLoading={isLoading}
              emptyText="Bugün henüz sipariş yok"
            />
            <PaymentCard
              title="Toplam Ödeme Dağılımı"
              icon={TrendingUp}
              iconColor="text-violet-600"
              iconBg="bg-violet-50"
              data={stats?.paymentBreakdownAll}
              total={stats?.totalRevenue ?? 0}
              totalLabel="Genel Toplam"
              totalColor="text-violet-600"
              isLoading={isLoading}
            />
          </div>

          {/* ── Row 4: En Çok Satanlar + Kategori ────────── */}
          <div className="grid gap-4 xl:grid-cols-2">
            {/* En çok satanlar */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-amber-50 flex items-center justify-center">
                    <Crown className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  En Çok Satan Ürünler
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
                ) : (stats?.topProducts?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Henüz veri yok</p>
                ) : (
                  <div className="space-y-1.5">
                    {stats?.topProducts.map((product, i) => {
                      const max = stats.topProducts[0]?.quantity ?? 1;
                      const pct = (product.quantity / max) * 100;
                      return (
                        <div key={product.name} className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-amber-50/50">
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
                              <span className="text-sm font-medium truncate">{product.name}</span>
                              <span className="text-xs font-bold ml-2 shrink-0">{formatCurrency(product.revenue)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-linear-to-r from-amber-400 to-orange-400 transition-all duration-700"
                                  style={{ width: `${Math.max(pct, 4)}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-gray-500 shrink-0 font-medium">{product.quantity} adet</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Kategori dağılımı */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-rose-50 flex items-center justify-center">
                    <UtensilsCrossed className="h-3.5 w-3.5 text-rose-600" />
                  </div>
                  Kategori Dağılımı
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
                ) : (stats?.categoryBreakdown?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Henüz veri yok</p>
                ) : (
                  <div className="space-y-1.5">
                    {stats?.categoryBreakdown.map((cat) => {
                      const maxRev = Math.max(...(stats.categoryBreakdown.map((c) => c.revenue)), 1);
                      const pct = (cat.revenue / maxRev) * 100;
                      const catColor = CATEGORY_COLORS[cat.category];
                      return (
                        <div key={cat.category} className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-gray-50">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${catColor?.bg ?? "bg-gray-100"}`}>
                            <div className={`h-2.5 w-2.5 rounded-full bg-linear-to-r ${catColor?.from ?? "from-gray-400"} ${catColor?.to ?? "to-gray-500"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{cat.label}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] text-gray-500 font-medium">{cat.quantity} adet</span>
                                <span className="text-xs font-bold">{formatCurrency(cat.revenue)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full bg-linear-to-r ${catColor?.from ?? "from-gray-400"} ${catColor?.to ?? "to-gray-500"} transition-all duration-700`}
                                style={{ width: `${Math.max(pct, 4)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Row 5: Adresler + Menü Tercihleri ────────── */}
          <div className="grid gap-4 xl:grid-cols-2">
            {/* En çok sipariş veren adresler */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-rose-50 flex items-center justify-center">
                    <MapPin className="h-3.5 w-3.5 text-rose-600" />
                  </div>
                  En Çok Sipariş Veren Adresler
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
                ) : (stats?.topAddresses?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Henüz veri yok</p>
                ) : (
                  <div className="space-y-2">
                    {stats?.topAddresses.map((addr, i) => {
                      const maxCount = stats.topAddresses[0]?.orderCount ?? 1;
                      const pct = (addr.orderCount / maxCount) * 100;
                      return (
                        <div key={i} className="group rounded-xl p-3 transition-colors hover:bg-rose-50/40">
                          <div className="flex items-start gap-3">
                            <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold shrink-0 mt-0.5 ${
                              i < 3 ? "bg-linear-to-br from-rose-400 to-pink-500 text-white shadow-sm" : "bg-gray-100 text-gray-500"
                            }`}>
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-tight truncate" title={addr.address}>{addr.address}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[11px] text-gray-500 flex items-center gap-1 font-medium">
                                  <ShoppingBag className="h-3 w-3" /> {addr.orderCount} sipariş
                                </span>
                                <span className="text-[11px] font-bold text-rose-600">{formatCurrency(addr.revenue)}</span>
                              </div>
                              <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2">
                                <div
                                  className="h-full rounded-full bg-linear-to-r from-rose-400 to-pink-400 transition-all duration-700"
                                  style={{ width: `${Math.max(pct, 4)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* En çok tercih edilen menüler */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-amber-50 flex items-center justify-center">
                    <Star className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  En Çok Tercih Edilen Menüler
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
                ) : (stats?.menuPreferences?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Henüz veri yok</p>
                ) : (
                  <div className="space-y-2">
                    {stats?.menuPreferences.map((item, i) => {
                      const maxQty = stats.menuPreferences[0]?.quantity ?? 1;
                      const pct = (item.quantity / maxQty) * 100;
                      const catColor = CATEGORY_COLORS[item.category];
                      return (
                        <div key={item.name} className="group rounded-xl p-3 transition-colors hover:bg-amber-50/40">
                          <div className="flex items-start gap-3">
                            <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold shrink-0 mt-0.5 ${
                              i < 3 ? "bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-sm" : "bg-gray-100 text-gray-500"
                            }`}>
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{item.name}</span>
                                <Badge variant="outline" className={`text-[10px] shrink-0 font-medium ${catColor?.text ?? "text-gray-600"} ${catColor?.bg ?? "bg-gray-50"} border-0`}>
                                  {item.categoryLabel}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[11px] text-gray-500 font-medium">{item.orderCount} sipariş</span>
                                <span className="text-[11px] text-gray-500 font-medium">{item.quantity} adet</span>
                                <span className="text-[11px] font-bold text-amber-600">{formatCurrency(item.revenue)}</span>
                              </div>
                              <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2">
                                <div
                                  className={`h-full rounded-full bg-linear-to-r ${catColor?.from ?? "from-gray-400"} ${catColor?.to ?? "to-gray-500"} transition-all duration-700`}
                                  style={{ width: `${Math.max(pct, 4)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  borderColor,
  trend,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  borderColor: string;
  trend?: { pct: number; up: boolean } | null;
  subtitle?: string;
}) {
  return (
    <Card className={`border shadow-sm border-l-4 ${borderColor} hover:shadow-md transition-shadow`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-medium">{label}</p>
            <p className="text-2xl font-bold tracking-tight text-gray-900">{value}</p>
            {trend && (
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md ${
                  trend.up ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
                }`}>
                  {trend.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(trend.pct)}%
                </span>
                {subtitle && <span className="text-[10px] text-gray-400">{subtitle}</span>}
              </div>
            )}
          </div>
          <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KPICardSkeleton() {
  return (
    <Card className="border shadow-sm border-l-4 border-l-gray-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mini Stat ─────────────────────────────────────────────────────────────────

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl bg-white border p-3.5 flex items-center gap-3 hover:shadow-sm transition-shadow">
      <div className={`rounded-lg p-2 ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div>
        <p className="text-[11px] text-gray-500 font-medium">{label}</p>
        <p className="text-lg font-bold leading-tight text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// ─── Status Donut ──────────────────────────────────────────────────────────────

function StatusDonut({
  statusBreakdown,
  totalOrders,
}: {
  statusBreakdown: Record<string, number>;
  totalOrders: number;
}) {
  const entries = Object.entries(statusBreakdown).filter(([, count]) => count > 0);
  const total = entries.reduce((s, [, c]) => s + c, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-gray-400">
        <Activity className="h-8 w-8 mb-2" />
        <p className="text-sm">Henüz veri yok</p>
      </div>
    );
  }

  // Build conic-gradient segments
  const colorMap: Record<string, string> = {
    pending: "#f59e0b",
    preparing: "#3b82f6",
    "on-the-way": "#8b5cf6",
    delivered: "#10b981",
    cancelled: "#ef4444",
  };
  let cumPct = 0;
  const segments = entries.map(([status, count]) => {
    const pct = (count / total) * 100;
    const start = cumPct;
    cumPct += pct;
    return { status, count, pct, start, end: cumPct, color: colorMap[status] ?? "#94a3b8" };
  });

  const gradient = segments
    .map((s) => `${s.color} ${s.start}% ${s.end}%`)
    .join(", ");

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Donut */}
      <div className="relative">
        <div
          className="h-36 w-36 rounded-full"
          style={{
            background: `conic-gradient(${gradient})`,
            maskImage: "radial-gradient(circle, transparent 55%, black 56%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 55%, black 56%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <span className="text-[10px] text-gray-400 font-medium">toplam</span>
        </div>
      </div>

      {/* Legend */}
      <div className="w-full space-y-2">
        {segments.map((s) => {
          const cfg = statusConfig[s.status as Order["status"]];
          return (
            <div key={s.status} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-gray-600 font-medium">{cfg?.label ?? s.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{s.count}</span>
                <span className="text-xs text-gray-400 w-10 text-right">{s.pct.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Payment Card ──────────────────────────────────────────────────────────────

function PaymentCard({
  title,
  icon: Icon,
  iconColor,
  iconBg,
  data,
  total,
  totalLabel,
  totalColor,
  isLoading,
  emptyText,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  data?: Record<string, number>;
  total: number;
  totalLabel: string;
  totalColor: string;
  isLoading: boolean;
  emptyText?: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className={`h-6 w-6 rounded-md ${iconBg} flex items-center justify-center`}>
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}</div>
        ) : (
          <div className="space-y-3">
            {Object.entries(data ?? {}).map(([method, amount]) => {
              const config = PAYMENT_LABELS[method];
              if (!config) return null;
              const pct = total > 0 ? (amount / total) * 100 : 0;
              const PayIcon = config.icon;
              return (
                <div key={method} className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${config.bg}`}>
                    <PayIcon className={`h-3.5 w-3.5 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{config.label}</span>
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(amount)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${config.bg} transition-all duration-700`}
                        style={{ width: `${Math.max(pct, 1)}%`, opacity: 0.8 }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-10 text-right font-medium">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
            {data && Object.values(data).every((v) => v === 0) && emptyText && (
              <p className="text-sm text-gray-400 text-center py-6">{emptyText}</p>
            )}
            <Separator className="my-1" />
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-bold text-gray-900">{totalLabel}</span>
              <span className={`text-sm font-bold ${totalColor}`}>{formatCurrency(total)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
