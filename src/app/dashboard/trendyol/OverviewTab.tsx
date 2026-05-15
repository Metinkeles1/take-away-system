"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getTrendyolDashboardStats,
  type TrendyolDashboardStats,
  type TrendyolPeriod,
} from "@/actions/trendyolDashboard";
import {
  ShoppingBag,
  CircleDollarSign,
  CheckCircle2,
  Receipt,
  XCircle,
  RefreshCw,
  CalendarDays,
  Flame,
  AlertTriangle,
  Wallet,
  Percent,
  Ticket,
  Undo2,
  Banknote,
  PiggyBank,
  Package,
  CreditCard,
} from "lucide-react";
import { KPICard, KPICardSkeleton } from "@/components/dashboard/KPICard";
import { PaymentBreakdown } from "@/components/dashboard/PaymentBreakdown";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  Created: { label: "Yeni", color: "bg-blue-50 text-blue-700 border-blue-200" },
  Picking: { label: "Kabul Edildi", color: "bg-amber-50 text-amber-700 border-amber-200" },
  Invoiced: { label: "Hazırlandı", color: "bg-violet-50 text-violet-700 border-violet-200" },
  Shipped: { label: "Yolda", color: "bg-orange-50 text-orange-700 border-orange-200" },
  Delivered: { label: "Teslim Edildi", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Cancelled: { label: "İptal", color: "bg-red-50 text-red-700 border-red-200" },
  UnSupplied: { label: "Karşılanamadı", color: "bg-red-50 text-red-700 border-red-200" },
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInputValue(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function OverviewTab() {
  const [period, setPeriod] = useState<TrendyolPeriod>("today");
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toDateInputValue(new Date()),
  );
  const [stats, setStats] = useState<TrendyolDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const todayValue = useMemo(() => toDateInputValue(new Date()), []);
  const isToday = selectedDate === todayValue;

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const refDate = parseDateInputValue(selectedDate).getTime();
      const data = await getTrendyolDashboardStats(period, refDate);
      setStats(data);
      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedDate]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const totalPayment = useMemo(
    () => stats?.paymentBreakdown.reduce((s, p) => s + p.revenue, 0) ?? 0,
    [stats?.paymentBreakdown],
  );

  const paymentRecord = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = { cash: 0, card: 0, online: 0, meal_card: 0 };
    for (const p of stats?.paymentBreakdown ?? []) out[p.key] = (out[p.key] ?? 0) + p.revenue;
    return out;
  }, [stats?.paymentBreakdown]);

  const periodLabel = useMemo(() => {
    if (period === "today") {
      if (isToday) return "Bugün";
      const d = parseDateInputValue(selectedDate);
      return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
    }
    if (period === "week") return isToday ? "Son 7 Gün" : "7 Günlük";
    return isToday ? "Son 30 Gün" : "30 Günlük";
  }, [period, isToday, selectedDate]);

  return (
    <div className="space-y-6">
      <OverviewControls
        isLoading={isLoading}
        onRefresh={loadStats}
        lastUpdated={lastUpdated}
        period={period}
        onPeriodChange={setPeriod}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        maxDate={todayValue}
        isToday={isToday}
      />

      <div>
        <div className="space-y-6">
          {stats?.error && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 text-sm text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Trendyol API&apos;sına ulaşılamadı</p>
                <p className="text-xs mt-0.5 text-amber-800">{stats.error}</p>
                <p className="text-xs mt-1.5 text-amber-700">
                  Env değişkenleri (TRENDYOL_API_KEY, TRENDYOL_API_SECRET, TRENDYOL_SUPPLIER_ID) kontrol et.
                </p>
              </div>
            </div>
          )}

          {/* KPI Kartları — period bazlı */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {isLoading && !stats ? (
              [...Array(4)].map((_, i) => <KPICardSkeleton key={i} />)
            ) : (
              <>
                <KPICard
                  label={`${periodLabel} · Toplam Sipariş`}
                  value={String(stats?.orderCount ?? 0)}
                  icon={ShoppingBag}
                  color="blue"
                />
                <KPICard
                  label={`${periodLabel} · Ciro`}
                  value={formatCurrency(stats?.revenue ?? 0)}
                  icon={CircleDollarSign}
                  color="emerald"
                />
                <KPICard
                  label="Teslim Edildi"
                  value={String(stats?.deliveredCount ?? 0)}
                  icon={CheckCircle2}
                  color="violet"
                />
                <KPICard
                  label="Ortalama Sepet"
                  value={formatCurrency(stats?.avgBasket ?? 0)}
                  icon={Receipt}
                  color="amber"
                />
              </>
            )}
          </div>

          {/* Finansal Özet */}
          {!isLoading && stats && (
            <Card className="bg-white rounded-2xl border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-600" />
                    Finansal Özet ({periodLabel})
                  </CardTitle>
                  {!stats.settlementsAvailable && (
                    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      Settlement verisi alınamadı
                    </span>
                  )}
                </div>
                {stats.settlementsError && (
                  <p className="text-[11px] text-amber-700 mt-1">{stats.settlementsError}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <FinanceTile
                    icon={Banknote}
                    label="Brüt Satış"
                    value={stats.finance.grossSales}
                    tone="blue"
                  />
                  <FinanceTile
                    icon={Percent}
                    label="İndirim"
                    value={stats.finance.totalDiscount}
                    tone="amber"
                    negative
                  />
                  <FinanceTile
                    icon={Ticket}
                    label="Kupon"
                    value={stats.finance.totalCoupon}
                    tone="violet"
                    negative
                  />
                  <FinanceTile
                    icon={Undo2}
                    label="İade"
                    value={stats.finance.totalRefund}
                    tone="red"
                    negative
                  />
                  <FinanceTile
                    icon={Receipt}
                    label="Komisyon"
                    value={stats.finance.totalCommission}
                    tone="orange"
                    negative
                  />
                  <FinanceTile
                    icon={PiggyBank}
                    label="Net Hakediş"
                    value={stats.finance.netRevenue}
                    tone="emerald"
                    highlight
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ödeme yöntemleri + Yemek kartı kırılımı + En çok satanlar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="bg-white rounded-2xl border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Ödeme Yöntemleri ({periodLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading && !stats ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <PaymentBreakdown
                    data={paymentRecord}
                    total={totalPayment}
                    emptyText="Bu dönemde Trendyol siparişi yok"
                    totalLabel={`${periodLabel} Toplam`}
                    totalColor="text-emerald-700"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="bg-white rounded-2xl border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-violet-600" />
                  Yemek Kartı Kırılımı
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading && !stats ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <MealCardList items={stats?.mealCardBreakdown ?? []} />
                )}
              </CardContent>
            </Card>

            <Card className="bg-white rounded-2xl border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4 text-orange-600" />
                  En Çok Satan Ürünler ({periodLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading && !stats ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <TopProductsList products={stats?.topProducts ?? []} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Durum dağılımı — full width */}
          <Card className="bg-white rounded-2xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Durum Dağılımı</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <StatusList items={stats?.statusBreakdown ?? []} />
              )}
            </CardContent>
          </Card>

          {/* Son siparişler */}
          <Card className="bg-white rounded-2xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Son Trendyol Siparişleri</CardTitle>
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
                        <th className="text-left py-2 px-2 font-medium">Ödeme</th>
                        <th className="text-left py-2 px-2 font-medium">Durum</th>
                        <th className="text-right py-2 px-2 font-medium">Tutar</th>
                        <th className="text-right py-2 px-2 font-medium">Net Hakediş</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentOrders.map((o) => {
                        const cfg = STATUS_LABEL[o.status];
                        return (
                          <tr key={o.id} className="border-b last:border-b-0 hover:bg-gray-50">
                            <td className="py-2.5 px-2 font-semibold text-gray-900">#{o.orderNumber}</td>
                            <td className="py-2.5 px-2 text-gray-700">{o.customerName}</td>
                            <td className="py-2.5 px-2">
                              <Badge variant="secondary" className="text-xs">
                                {o.paymentMethod}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-2">
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border ${cfg?.color ?? "bg-gray-50 text-gray-600 border-gray-200"}`}
                              >
                                {cfg?.label ?? o.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right font-bold text-gray-900">
                              {formatCurrency(o.total)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-bold text-emerald-700">
                              {o.netRevenue !== undefined
                                ? formatCurrency(o.netRevenue)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={XCircle} text="Bu dönemde Trendyol siparişi yok" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Yardımcı bileşenler ─────────────────────────────────────────────────

function OverviewControls({
  isLoading,
  onRefresh,
  lastUpdated,
  period,
  onPeriodChange,
  selectedDate,
  onDateChange,
  maxDate,
  isToday,
}: {
  isLoading: boolean;
  onRefresh: () => void;
  lastUpdated: Date | null;
  period: TrendyolPeriod;
  onPeriodChange: (p: TrendyolPeriod) => void;
  selectedDate: string;
  onDateChange: (v: string) => void;
  maxDate: string;
  isToday: boolean;
}) {
  const dateObj = parseDateInputValue(selectedDate);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        className="text-sm text-gray-600 flex items-center gap-1.5"
        suppressHydrationWarning
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {dateObj.toLocaleDateString("tr-TR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        {lastUpdated && (
          <span className="text-xs text-gray-400 ml-2" suppressHydrationWarning>
            · son güncelleme{" "}
            {lastUpdated.toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1">
          <CalendarDays className="h-3.5 w-3.5 text-gray-500" />
          <input
            type="date"
            value={selectedDate}
            max={maxDate}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={isLoading}
            className="text-xs font-medium text-gray-700 bg-transparent outline-none disabled:opacity-50"
          />
          {!isToday && (
            <button
              type="button"
              onClick={() => onDateChange(maxDate)}
              disabled={isLoading}
              className="text-[10px] font-semibold text-orange-600 hover:text-orange-700 ml-1"
              title="Bugüne dön"
            >
              bugün
            </button>
          )}
        </div>
        <PeriodToggle period={period} onChange={onPeriodChange} disabled={isLoading} isToday={isToday} />
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>
    </div>
  );
}

function PeriodToggle({
  period,
  onChange,
  disabled,
  isToday,
}: {
  period: TrendyolPeriod;
  onChange: (p: TrendyolPeriod) => void;
  disabled?: boolean;
  isToday: boolean;
}) {
  const opts: { key: TrendyolPeriod; label: string }[] = [
    { key: "today", label: isToday ? "Bugün" : "Gün" },
    { key: "week", label: isToday ? "Son 7 Gün" : "7 Gün" },
    { key: "month", label: isToday ? "Son 30 Gün" : "30 Gün" },
  ];
  return (
    <div className="inline-flex rounded-lg border bg-white p-0.5">
      {opts.map(({ key, label }) => {
        const active = key === period;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            disabled={disabled || active}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              active
                ? "bg-orange-500 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            } ${disabled && !active ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function StatusList({ items }: { items: { status: string; count: number }[] }) {
  if (items.length === 0) return <EmptyState icon={Flame} text="Henüz veri yok" />;
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => {
        const cfg = STATUS_LABEL[i.status];
        const pct = total > 0 ? (i.count / total) * 100 : 0;
        return (
          <li key={i.status} className="flex items-center gap-3 text-sm">
            <span
              className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${cfg?.color ?? "bg-gray-50 text-gray-600 border-gray-200"}`}
            >
              {cfg?.label ?? i.status}
            </span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full transition-all"
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
            <span className="text-sm font-bold text-gray-900 w-8 text-right">{i.count}</span>
          </li>
        );
      })}
    </ul>
  );
}

function FinanceTile({
  icon: Icon,
  label,
  value,
  tone,
  negative,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: "blue" | "amber" | "violet" | "red" | "orange" | "emerald";
  negative?: boolean;
  highlight?: boolean;
}) {
  const tones = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-600" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", icon: "text-amber-600" },
    violet: { bg: "bg-violet-50", text: "text-violet-700", icon: "text-violet-600" },
    red: { bg: "bg-red-50", text: "text-red-700", icon: "text-red-600" },
    orange: { bg: "bg-orange-50", text: "text-orange-700", icon: "text-orange-600" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "text-emerald-600" },
  }[tone];
  return (
    <div
      className={`rounded-xl border p-3 ${highlight ? "border-emerald-300 bg-emerald-50/50 ring-1 ring-emerald-200" : "border-gray-100 bg-white"}`}
    >
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-1.5 ${tones.bg}`}>
          <Icon className={`h-3.5 w-3.5 ${tones.icon}`} />
        </div>
        <span className="text-[11px] font-medium text-gray-500">{label}</span>
      </div>
      <p className={`mt-1.5 text-base font-bold ${highlight ? "text-emerald-700" : tones.text}`}>
        {negative && value > 0 ? "−" : ""}
        {formatCurrency(value)}
      </p>
    </div>
  );
}

type MealCardItem = TrendyolDashboardStats["mealCardBreakdown"][number];

const MEAL_CARD_COLORS: Record<string, string> = {
  Multinet: "bg-yellow-400",
  "Sodexo / Pluxee": "bg-blue-500",
  Metropol: "bg-red-500",
  Ticket: "bg-orange-500",
  Setcard: "bg-emerald-500",
  Edenred: "bg-rose-500",
  TokenFlex: "bg-indigo-500",
  Paye: "bg-cyan-500",
  SmartPay: "bg-fuchsia-500",
  Diğer: "bg-gray-400",
};

function MealCardList({ items }: { items: MealCardItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={CreditCard} text="Bu dönemde yemek kartı ödemesi yok" />;
  }
  const total = items.reduce((s, i) => s + i.revenue, 0);
  const totalCount = items.reduce((s, i) => s + i.count, 0);
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {items.map((i) => {
          const pct = total > 0 ? (i.revenue / total) * 100 : 0;
          const color = MEAL_CARD_COLORS[i.brand] ?? "bg-gray-400";
          return (
            <li key={i.brand} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${color}`} />
                  <span className="font-medium text-gray-800 truncate">{i.brand}</span>
                  {i.source === "on_delivery" && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      kapıda
                    </span>
                  )}
                  {i.source === "mixed" && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      online + kapıda
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                  <span className="text-xs text-gray-500">×{i.count}</span>
                  <span className="text-sm font-bold text-gray-900 w-24 text-right">
                    {formatCurrency(i.revenue)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${color}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between pt-2 border-t text-xs">
        <span className="text-gray-500">Toplam</span>
        <div className="flex items-center gap-3 tabular-nums">
          <span className="text-gray-500">×{totalCount}</span>
          <span className="font-bold text-violet-700">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}

type TopProduct = TrendyolDashboardStats["topProducts"][number];
type ProductSort = "quantity" | "revenue";

function TopProductsList({ products }: { products: TopProduct[] }) {
  const [sortBy, setSortBy] = useState<ProductSort>("quantity");

  const sorted = useMemo(
    () => [...products].sort((a, b) => b[sortBy] - a[sortBy]),
    [products, sortBy],
  );

  if (products.length === 0) {
    return <EmptyState icon={ShoppingBag} text="Henüz veri yok" />;
  }

  const maxValue = sorted[0]?.[sortBy] ?? 1;
  const totalQty = products.reduce((s, p) => s + p.quantity, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500">
          {products.length} ürün · toplam {totalQty} adet
        </span>
        <div className="inline-flex rounded-lg border bg-white p-0.5">
          {(["quantity", "revenue"] as const).map((opt) => {
            const active = sortBy === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSortBy(opt)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  active
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {opt === "quantity" ? "Adet" : "Ciro"}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="space-y-1.5 max-h-120 overflow-y-auto pr-1">
        {sorted.map((p, i) => {
          const pct = maxValue > 0 ? (p[sortBy] / maxValue) * 100 : 0;
          return (
            <li
              key={p.name}
              className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 text-sm py-1.5"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-orange-100 text-orange-700 text-xs font-bold">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="truncate font-medium text-gray-800">{p.name}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-400 rounded-full transition-all"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0 tabular-nums">
                <span
                  className={`text-xs ${sortBy === "quantity" ? "font-bold text-gray-900" : "text-gray-500"}`}
                >
                  ×{p.quantity}
                </span>
                <span
                  className={`text-sm w-24 text-right ${sortBy === "revenue" ? "font-bold text-gray-900" : "text-gray-600"}`}
                >
                  {formatCurrency(p.revenue)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
