"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  getTrendyolDashboardStats,
  type TrendyolDashboardStats,
  type TrendyolPeriod,
} from "@/actions/trendyolDashboard";
import {
  XCircle,
  RefreshCw,
  CalendarDays,
  Flame,
  AlertTriangle,
  CreditCard,
  ShoppingBag,
} from "lucide-react";
import { PaymentBreakdown } from "@/components/dashboard/PaymentBreakdown";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";

const STATUS_LABEL: Record<string, { label: string; dot: string }> = {
  Created: { label: "Yeni", dot: "bg-sky-500" },
  Picking: { label: "Kabul Edildi", dot: "bg-amber-500" },
  Invoiced: { label: "Hazırlandı", dot: "bg-violet-500" },
  Shipped: { label: "Yolda", dot: "bg-orange-500" },
  Delivered: { label: "Teslim Edildi", dot: "bg-emerald-500" },
  Cancelled: { label: "İptal", dot: "bg-red-500" },
  UnSupplied: { label: "Karşılanamadı", dot: "bg-rose-500" },
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
  // SSR/hydration safety: date değerlerini ilk render'da boş bırakıp client mount sonrası set ediyoruz.
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [todayValue, setTodayValue] = useState<string>("");
  const [stats, setStats] = useState<TrendyolDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mealCardModalOpen, setMealCardModalOpen] = useState(false);

  useEffect(() => {
    const t = toDateInputValue(new Date());
    setTodayValue(t);
    setSelectedDate(t);
  }, []);

  const isToday = selectedDate === todayValue && todayValue !== "";

  const loadStats = useCallback(async () => {
    if (!selectedDate) return;
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
    if (selectedDate) loadStats();
  }, [loadStats, selectedDate]);

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
    if (!selectedDate) return "";
    if (period === "today") {
      if (isToday) return "Bugün";
      const d = parseDateInputValue(selectedDate);
      return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
    }
    if (period === "week") return isToday ? "Son 7 Gün" : "7 Günlük";
    return isToday ? "Son 30 Gün" : "30 Günlük";
  }, [period, isToday, selectedDate]);

  // Veri zaten varken yenileme yapılıyorsa "soft loading" göster.
  const softLoading = isLoading && !!stats;

  return (
    <div className="relative space-y-4 pb-4">
      {/* Top loading bar */}
      {isLoading && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
          aria-hidden
        >
          <div className="h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] bg-orange-500" />
          <style>{`
            @keyframes loading-bar {
              0% { transform: translateX(-100%); }
              50% { transform: translateX(200%); }
              100% { transform: translateX(400%); }
            }
          `}</style>
        </div>
      )}

      {/* Header bar */}
      <Header
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

      <div
        className={`space-y-4 transition-opacity duration-200 ${softLoading ? "opacity-60 pointer-events-none" : "opacity-100"}`}
        aria-busy={softLoading}
      >

      {stats?.error && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300/80 bg-amber-50/60 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Trendyol API&apos;sına ulaşılamadı</p>
            <p className="mt-0.5 text-xs text-amber-800">{stats.error}</p>
          </div>
        </div>
      )}

      {/* 1. KPI grid — 4 sade kart */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Sipariş"
          value={isLoading && !stats ? null : String(stats?.orderCount ?? 0)}
          hint={isLoading && !stats ? "" : `${stats?.deliveredCount ?? 0} teslim · ${stats?.cancelledCount ?? 0} iptal`}
        />
        <Kpi
          label="Ciro"
          value={isLoading && !stats ? null : formatCurrency(stats?.revenue ?? 0)}
          hint={periodLabel}
          accent
        />
        <Kpi
          label="Net Hakediş"
          value={isLoading && !stats ? null : formatCurrency(stats?.finance.netRevenue ?? 0)}
          hint={
            isLoading && !stats
              ? ""
              : stats?.settlementsAvailable
                ? "Settlement"
                : "Tahmini"
          }
          tone="emerald"
        />
        <Kpi
          label="Ortalama Sepet"
          value={isLoading && !stats ? null : formatCurrency(stats?.avgBasket ?? 0)}
          hint={isLoading && !stats ? "" : `${stats?.orderCount ?? 0} sipariş`}
        />
      </div>

      {/* 2. Chart + Finans yan yana lg'de */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chart — 2/3 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardDescription>Saatlik Sipariş Trafiği</CardDescription>
            <CardTitle className="text-base">{periodLabel}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pt-1 sm:px-3">
            {isLoading && !stats ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <HourlyChart hourly={stats?.hourly ?? []} />
            )}
          </CardContent>
        </Card>

        {/* Finans listesi — 1/3 */}
        <Card>
          <CardHeader>
            <CardDescription>Finansal Akış</CardDescription>
            <CardTitle className="text-base">Brüt → Net</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && !stats ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <FinanceFlow finance={stats!.finance} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3. Ödeme + Top Ürünler — 2-col, mobilde stack */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Ödeme Yöntemleri</CardDescription>
            <CardTitle className="text-base">Dağılım</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && !stats ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <PaymentBreakdown
                data={paymentRecord}
                total={totalPayment}
                emptyText="Bu dönemde Trendyol siparişi yok"
                totalLabel="Toplam"
                totalColor="text-emerald-700"
                onMethodClick={(method) => {
                  if (method === "meal_card") setMealCardModalOpen(true);
                }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>En Çok Satan Ürünler</CardDescription>
            <CardTitle className="text-base">{periodLabel}</CardTitle>
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

      {/* 4. Durum + Son Siparişler — 1/3 + 2/3 lg'de */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Durum Dağılımı</CardDescription>
            <CardTitle className="text-base">{periodLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && !stats ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <StatusList items={stats?.statusBreakdown ?? []} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardDescription>Son Trendyol Siparişleri</CardDescription>
            <CardTitle className="text-base">
              {isLoading && !stats ? "—" : `${stats?.recentOrders.length ?? 0} sipariş`}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-2">
            {isLoading && !stats ? (
              <div className="px-4">
                <Skeleton className="h-48 w-full" />
              </div>
            ) : stats?.recentOrders.length ? (
              <OrdersList orders={stats.recentOrders} />
            ) : (
              <EmptyState icon={XCircle} text="Bu dönemde Trendyol siparişi yok" />
            )}
          </CardContent>
        </Card>
      </div>

      </div>{/* /softLoading wrapper */}

      {/* Yemek kartı marka kırılımı modal */}
      <Dialog open={mealCardModalOpen} onOpenChange={setMealCardModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yemek Kartı Kırılımı</DialogTitle>
            <DialogDescription>
              {periodLabel} dönemindeki yemek kartı ödemelerinin marka bazlı dağılımı.
            </DialogDescription>
          </DialogHeader>
          <MealCardList items={stats?.mealCardBreakdown ?? []} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────

function Header({
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
  const dateLabel = selectedDate
    ? parseDateInputValue(selectedDate).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        suppressHydrationWarning
      >
        <CalendarDays className="h-4 w-4" />
        <span className="font-medium text-foreground">{dateLabel}</span>
        {lastUpdated && (
          <span className="hidden text-xs sm:inline" suppressHydrationWarning>
            · {lastUpdated.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 text-xs font-medium shadow-xs">
          <input
            type="date"
            value={selectedDate}
            max={maxDate}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={isLoading}
            className="bg-transparent outline-none tabular-nums disabled:opacity-50"
          />
          {!isToday && (
            <button
              type="button"
              onClick={() => onDateChange(maxDate)}
              disabled={isLoading}
              className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 hover:text-orange-700"
            >
              bugün
            </button>
          )}
        </label>

        <Select
          value={period}
          onValueChange={(v) => onPeriodChange(v as TrendyolPeriod)}
          disabled={isLoading}
        >
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{isToday ? "Bugün" : "Seçili Gün"}</SelectItem>
            <SelectItem value="week">{isToday ? "Son 7 Gün" : "7 Günlük"}</SelectItem>
            <SelectItem value="month">{isToday ? "Son 30 Gün" : "30 Günlük"}</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-8 gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Yenile</span>
        </Button>
      </div>
    </div>
  );
}

// ─── KPI card (minimum) ─────────────────────────────────────────────

function Kpi({
  label,
  value,
  hint,
  tone,
  accent,
}: {
  label: string;
  value: string | null;
  hint: string;
  tone?: "emerald";
  accent?: boolean;
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-700"
      : accent
        ? "text-orange-700"
        : "text-foreground";
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="text-xs">{label}</CardDescription>
        {value === null ? (
          <Skeleton className="mt-1 h-7 w-24" />
        ) : (
          <CardTitle
            className={`text-2xl font-semibold tabular-nums tracking-tight ${valueClass}`}
          >
            {value}
          </CardTitle>
        )}
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-3 w-20" />
        ) : (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Hourly chart (tek area, sade) ──────────────────────────────────

const hourlyChartConfig = {
  orders: {
    label: "Sipariş",
    color: "rgb(249 115 22)",
  },
} satisfies ChartConfig;

function HourlyChart({
  hourly,
}: {
  hourly: { hour: number; orders: number; revenue: number }[];
}) {
  const total = hourly.reduce((s, h) => s + h.orders, 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center">
        <EmptyState icon={Flame} text="Bu dönemde sipariş yok" />
      </div>
    );
  }

  const data = hourly.map((h) => ({
    hour: h.hour,
    label: `${String(h.hour).padStart(2, "0")}:00`,
    orders: h.orders,
    revenue: Math.round(h.revenue),
  }));

  const maxOrders = Math.max(1, ...data.map((d) => d.orders));

  return (
    <ChartContainer config={hourlyChartConfig} className="aspect-auto h-56 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 24, bottom: 0 }}>
        <defs>
          <linearGradient id="fillOrders" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="rgb(249 115 22)" stopOpacity={0.5} />
            <stop offset="95%" stopColor="rgb(249 115 22)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.4} />
        <XAxis
          dataKey="hour"
          ticks={[0, 6, 12, 18, 23]}
          tickFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          fontSize={11}
        />
        <YAxis hide domain={[0, Math.ceil(maxOrders * 1.25)]} />
        <ChartTooltip
          cursor={{
            stroke: "rgb(249 115 22)",
            strokeOpacity: 0.4,
            strokeDasharray: "3 3",
          }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
              formatter={(value, _name, item) => {
                const rev = item.payload?.revenue ?? 0;
                return [
                  `${value} sipariş · ${formatCurrency(Number(rev))}`,
                  "Sipariş",
                ];
              }}
              indicator="line"
            />
          }
        />
        <Area
          dataKey="orders"
          type="natural"
          stroke="rgb(249 115 22)"
          strokeWidth={2}
          fill="url(#fillOrders)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

// ─── Finance flow (sade liste) ──────────────────────────────────────

function FinanceFlow({ finance }: { finance: TrendyolDashboardStats["finance"] }) {
  const rows: { label: string; value: number; negative?: boolean }[] = [
    { label: "Brüt Satış", value: finance.grossSales },
    { label: "İndirim", value: finance.totalDiscount, negative: true },
    { label: "Kupon", value: finance.totalCoupon, negative: true },
    { label: "İade", value: finance.totalRefund, negative: true },
    { label: "Komisyon", value: finance.totalCommission, negative: true },
  ];

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center justify-between py-1.5 text-sm"
        >
          <span className="text-muted-foreground">{r.label}</span>
          <span
            className={`font-medium tabular-nums ${
              r.negative && r.value > 0 ? "text-rose-600" : "text-foreground"
            }`}
          >
            {r.negative && r.value > 0 ? "−" : ""}
            {formatCurrency(r.value)}
          </span>
        </div>
      ))}
      <Separator className="my-2" />
      <div className="flex items-center justify-between py-1">
        <span className="text-sm font-semibold">Net Hakediş</span>
        <span className="text-lg font-bold tabular-nums text-emerald-700">
          {formatCurrency(finance.netRevenue)}
        </span>
      </div>
    </div>
  );
}

// ─── Status list ────────────────────────────────────────────────────

function StatusList({ items }: { items: { status: string; count: number }[] }) {
  if (items.length === 0) return <EmptyState icon={Flame} text="Henüz veri yok" />;
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <ul className="space-y-3">
      {items.map((i) => {
        const cfg = STATUS_LABEL[i.status];
        const pct = total > 0 ? (i.count / total) * 100 : 0;
        return (
          <li key={i.status} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${cfg?.dot ?? "bg-muted-foreground"}`} />
                <span className="font-medium">{cfg?.label ?? i.status}</span>
              </div>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-xs text-muted-foreground">%{pct.toFixed(0)}</span>
                <span className="text-sm font-semibold">{i.count}</span>
              </div>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-orange-500 transition-all"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Orders list (mobile-friendly: table on lg, cards on mobile) ───

function OrdersList({ orders }: { orders: TrendyolDashboardStats["recentOrders"] }) {
  return (
    <>
      {/* Mobile: card list */}
      <div className="space-y-2 px-2 md:hidden">
        {orders.map((o) => {
          const cfg = STATUS_LABEL[o.status];
          return (
            <div
              key={o.id}
              className="rounded-md border bg-card p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold tabular-nums">#{o.orderNumber}</span>
                <Badge variant="outline" className="gap-1.5 font-medium">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${cfg?.dot ?? "bg-muted-foreground"}`}
                  />
                  {cfg?.label ?? o.status}
                </Badge>
              </div>
              <p className="mt-1 text-foreground">{o.customerName}</p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <Badge variant="secondary" className="font-medium">
                  {o.paymentMethod}
                </Badge>
                <div className="tabular-nums">
                  <span className="font-semibold">{formatCurrency(o.total)}</span>
                  {o.netRevenue !== undefined && (
                    <span className="ml-2 text-emerald-700">
                      net {formatCurrency(o.netRevenue)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2.5 px-3 text-left font-medium">Sipariş</th>
              <th className="py-2.5 px-3 text-left font-medium">Müşteri</th>
              <th className="py-2.5 px-3 text-left font-medium">Durum</th>
              <th className="py-2.5 px-3 text-right font-medium">Tutar</th>
              <th className="py-2.5 px-3 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const cfg = STATUS_LABEL[o.status];
              return (
                <tr
                  key={o.id}
                  className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
                >
                  <td className="py-2.5 px-3 font-semibold tabular-nums">
                    #{o.orderNumber}
                  </td>
                  <td className="py-2.5 px-3">
                    <div>{o.customerName}</div>
                    <div className="text-xs text-muted-foreground">{o.paymentMethod}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant="outline" className="gap-1.5 font-medium">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${cfg?.dot ?? "bg-muted-foreground"}`}
                      />
                      {cfg?.label ?? o.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                    {formatCurrency(o.total)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-emerald-700">
                    {o.netRevenue !== undefined ? formatCurrency(o.netRevenue) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Meal cards ─────────────────────────────────────────────────────

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
  Diğer: "bg-muted-foreground",
};

function MealCardList({ items }: { items: MealCardItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={CreditCard} text="Yemek kartı ödemesi yok" />;
  }
  const total = items.reduce((s, i) => s + i.revenue, 0);
  return (
    <ul className="space-y-3">
      {items.map((i) => {
        const pct = total > 0 ? (i.revenue / total) * 100 : 0;
        const color = MEAL_CARD_COLORS[i.brand] ?? "bg-muted-foreground";
        return (
          <li key={i.brand} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} />
                <span className="truncate font-medium">{i.brand}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {formatCurrency(i.revenue)}
              </span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${color}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Top products ──────────────────────────────────────────────────

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as ProductSort)}>
          <SelectTrigger size="sm" className="w-24 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quantity">Adet</SelectItem>
            <SelectItem value="revenue">Ciro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ul className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {sorted.slice(0, 10).map((p, i) => {
          const pct = maxValue > 0 ? (p[sortBy] / maxValue) * 100 : 0;
          return (
            <li
              key={p.name}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
            >
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <div className="min-w-0">
                <div className="mb-1 truncate font-medium">{p.name}</div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums shrink-0">
                {sortBy === "quantity" ? `×${p.quantity}` : formatCurrency(p.revenue)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

