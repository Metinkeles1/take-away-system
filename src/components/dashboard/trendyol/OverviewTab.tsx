"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  Label,
} from "recharts";
import {
  getTrendyolDashboardStats,
  type TrendyolDashboardStats,
  type TrendyolPeriod,
  type TrendyolRecentOrder,
} from "@/actions/trendyolDashboard";
import { TrendyolOrderDetailDialog } from "./TrendyolOrderDetailDialog";
import {
  AlertTriangle,
  CreditCard,
  ShoppingBag,
  Wallet,
  TrendingUp,
  Receipt,
  RefreshCw,
  Download,
  ArrowUpRight,
  Info,
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency } from "@/lib/utils";

// ─── status map (chart vars + muted-foreground tonlar) ──────────────

const STATUS_LABEL: Record<
  string,
  { label: string; cssVar: string }
> = {
  Created:    { label: "Yeni",            cssVar: "var(--chart-1)" },
  Picking:    { label: "Kabul Edildi",    cssVar: "var(--chart-2)" },
  Invoiced:   { label: "Hazırlandı",      cssVar: "var(--chart-3)" },
  Shipped:    { label: "Yolda",           cssVar: "var(--chart-4)" },
  Delivered:  { label: "Teslim Edildi",   cssVar: "var(--chart-5)" },
  Cancelled:  { label: "İptal",           cssVar: "var(--destructive)" },
  UnSupplied: { label: "Karşılanamadı",   cssVar: "var(--destructive)" },
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function OverviewTab() {
  const [period, setPeriod] = useState<TrendyolPeriod>("today");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [todayValue, setTodayValue] = useState<string>("");
  const [stats, setStats] = useState<TrendyolDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mealCardModalOpen, setMealCardModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<TrendyolRecentOrder | null>(
    null,
  );

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

  const softLoading = isLoading && !!stats;

  return (
    <div className="relative space-y-4">
      {/* ── Top bar: title + controls ──────────────────────────────
         Mobil: başlık üstte tam genişlik, kontroller altta sarılır.
         lg+: tek satır, başlık solda kontroller sağda.
         Tab label'ları kısa tutuldu ("Son" prefix kaldırıldı) ki TabsList
         dar viewport'larda yatay scroll oluşturmasın. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">Genel Bakış</h2>
          <p className="text-sm text-muted-foreground">
            {periodLabel} · Trendyol GO Yemek satış özeti
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={period}
            onValueChange={(v) => setPeriod(v as TrendyolPeriod)}
          >
            <TabsList>
              <TabsTrigger value="today" disabled={isLoading}>
                Bugün
              </TabsTrigger>
              <TabsTrigger value="week" disabled={isLoading}>
                7 Gün
              </TabsTrigger>
              <TabsTrigger value="month" disabled={isLoading}>
                30 Gün
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <input
            type="date"
            value={selectedDate}
            max={todayValue}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={isLoading}
            suppressHydrationWarning
            className="h-8 w-38 rounded-md border bg-background px-2.5 text-sm tabular-nums outline-none transition focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
          />

          <Button
            size="sm"
            variant="outline"
            onClick={loadStats}
            disabled={isLoading}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Yenile</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled
            className="hidden sm:inline-flex h-8 gap-1.5"
          >
            <Download className="size-3.5" />
            <span className="hidden md:inline">Dışa Aktar</span>
          </Button>
        </div>
      </div>

      {stats?.error && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Trendyol API&apos;sına ulaşılamadı</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stats.error}</p>
          </div>
        </div>
      )}

      <div
        className={`space-y-4 transition-opacity ${softLoading ? "opacity-60 pointer-events-none" : "opacity-100"}`}
        aria-busy={softLoading}
      >
        {/* ── KPI row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Toplam Sipariş"
            value={stats?.orderCount}
            valueFormat="number"
            isLoading={isLoading && !stats}
            icon={ShoppingBag}
            footer={
              stats
                ? `${stats.deliveredCount} teslim · ${stats.cancelledCount} iptal`
                : ""
            }
          />
          <KpiCard
            label="Toplam Ciro"
            value={stats?.revenue}
            valueFormat="currency"
            isLoading={isLoading && !stats}
            icon={Wallet}
            footer={periodLabel}
          />
          <KpiCard
            label="Tahmini Toplam Hakediş"
            value={stats?.finance.totalNet}
            valueFormat="currency"
            isLoading={isLoading && !stats}
            icon={TrendingUp}
            footer="Online net + yemek kartı (tahmini)"
            info="Gün sonu banka hesabına geçen tahmini net. İki kalem: (1) Online siparişlerin settlement bazlı GERÇEK neti; (2) Yemek kartı siparişlerinin tahmini neti — bunlar Trendyol settlement'ına düşmediği için (brüt − gerçek indirim) × (1−%12,6 Trendyol) × (1−%10 sağlayıcı) formülüyle hesaplanır. Kalemleri Finansal Akış kartında görebilirsiniz."
          />
          <KpiCard
            label="Ortalama Sepet"
            value={stats?.avgBasket}
            valueFormat="currency"
            isLoading={isLoading && !stats}
            icon={Receipt}
            footer={stats ? `${stats.orderCount} sipariş` : ""}
          />
        </div>

        {/* ── Row 2: hourly chart + recent orders ─────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle>Saatlik Sipariş Trafiği</CardTitle>
              <CardDescription>{periodLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <HourlyChart hourly={stats?.hourly ?? []} />
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Son Siparişler</CardTitle>
              <CardDescription>
                {stats?.recentOrders.length
                  ? `${stats.recentOrders.length} sipariş gösteriliyor`
                  : "Bu dönemde sipariş yok"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-64 w-full" />
              ) : stats?.recentOrders.length ? (
                <RecentOrdersList
                  orders={stats.recentOrders}
                  onSelect={setSelectedOrder}
                />
              ) : (
                <EmptyState icon={ShoppingBag} text="Bu dönemde sipariş yok" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Row 3: status + payment + top products + finance ─── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Sipariş Durumu</CardTitle>
              <CardDescription>Statü dağılımı</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <OrderStatsGauge
                  items={stats?.statusBreakdown ?? []}
                  total={stats?.orderCount ?? 0}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ödeme Yöntemleri</CardTitle>
              <CardDescription>Tahsilat dağılımı</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <PaymentBreakdown
                  data={paymentRecord}
                  total={totalPayment}
                  emptyText="Bu dönemde Trendyol siparişi yok"
                  totalLabel="Toplam"
                  onMethodClick={(method) => {
                    if (method === "meal_card") setMealCardModalOpen(true);
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>En Çok Satanlar</CardTitle>
              <CardDescription>Adet bazlı sıralama</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <TopProductsBlock products={stats?.topProducts ?? []} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Finansal Akış</CardTitle>
              <CardDescription>Brüt → Net</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <FinanceFlow finance={stats!.finance} />
              )}
            </CardContent>
          </Card>
        </div>

        {!isLoading && lastUpdated && (
          <p
            className="text-right text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            Son güncelleme{" "}
            {lastUpdated.toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      <TrendyolOrderDetailDialog
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      <Dialog open={mealCardModalOpen} onOpenChange={setMealCardModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yemek Kartı Kırılımı</DialogTitle>
            <DialogDescription>
              {periodLabel} dönemindeki yemek kartı ödemelerinin marka bazlı
              dağılımı.
            </DialogDescription>
          </DialogHeader>
          <MealCardList items={stats?.mealCardBreakdown ?? []} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── KPI Card (shadcn dashboard-01 style) ──────────────────────────

function KpiCard({
  label,
  value,
  valueFormat,
  isLoading,
  icon: Icon,
  footer,
  info,
}: {
  label: string;
  value: number | undefined;
  valueFormat: "number" | "currency";
  isLoading: boolean;
  icon: React.ComponentType<{ className?: string }>;
  footer: string;
  info?: string;
}) {
  const display =
    value === undefined
      ? "—"
      : valueFormat === "currency"
        ? formatCurrency(value)
        : value.toLocaleString("tr-TR");

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <CardDescription className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          {label}
          {info && (
            <Popover>
              <PopoverTrigger
                className="inline-flex shrink-0 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:text-foreground"
                aria-label={`${label} hakkında bilgi`}
              >
                <Info className="size-3.5" />
              </PopoverTrigger>
              <PopoverContent align="start" className="text-xs leading-relaxed">
                {info}
              </PopoverContent>
            </Popover>
          )}
        </CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {display}
          </p>
        )}
        {isLoading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <p className="text-xs text-muted-foreground">{footer}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Hourly bar chart ──────────────────────────────────────────────

const hourlyChartConfig = {
  orders: {
    label: "Sipariş",
    color: "var(--chart-2)",
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
      <div className="flex h-64 items-center justify-center">
        <EmptyState icon={ShoppingBag} text="Bu dönemde sipariş yok" />
      </div>
    );
  }

  const data = hourly.map((h) => ({
    hour: h.hour,
    label: `${String(h.hour).padStart(2, "0")}:00`,
    orders: h.orders,
    revenue: Math.round(h.revenue),
  }));

  return (
    <ChartContainer config={hourlyChartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
        <XAxis
          dataKey="hour"
          ticks={[0, 4, 8, 12, 16, 20, 23]}
          tickFormatter={(h) => `${String(h).padStart(2, "0")}`}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          fontSize={11}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tickMargin={4}
          fontSize={11}
          width={28}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
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
              indicator="dot"
            />
          }
        />
        <Bar
          dataKey="orders"
          fill="var(--color-orders)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}

// ─── Recent orders (avatar list, shadcn dashboard-01 Recent Sales) ─

function RecentOrdersList({
  orders,
  onSelect,
}: {
  orders: TrendyolRecentOrder[];
  onSelect: (order: TrendyolRecentOrder) => void;
}) {
  return (
    <ul className="space-y-2">
      {orders.slice(0, 6).map((o) => {
        const status = STATUS_LABEL[o.status];
        return (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onSelect(o)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
              aria-label={`#${o.orderNumber} detayını gör`}
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-foreground/80"
                style={{ background: "var(--muted)" }}
              >
                {initials(o.customerName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{o.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  #{o.orderNumber} · {status?.label ?? o.status}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {formatCurrency(o.total)}
                </p>
                {o.netRevenue !== undefined && (
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    net {formatCurrency(o.netRevenue)}
                  </p>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Order status donut ────────────────────────────────────────────

function OrderStatsGauge({
  items,
  total,
}: {
  items: { status: string; count: number }[];
  total: number;
}) {
  if (items.length === 0 || total === 0) {
    return (
      <div className="flex h-48 items-center justify-center">
        <EmptyState icon={ShoppingBag} text="Bu dönemde sipariş yok" />
      </div>
    );
  }

  const segments = items
    .map((i) => ({
      key: i.status,
      name: STATUS_LABEL[i.status]?.label ?? i.status,
      value: i.count,
      cssVar: STATUS_LABEL[i.status]?.cssVar ?? "var(--muted-foreground)",
      pct: (i.count / total) * 100,
    }))
    .sort((a, b) => b.value - a.value);

  const deliveredPct =
    ((items.find((i) => i.status === "Delivered")?.count ?? 0) / total) * 100;

  return (
    <div className="space-y-3">
      {/* Donut chart (sabit yükseklikli wrapper → recharts collapse riski yok) */}
      <ChartContainer
        config={{}}
        className="mx-auto aspect-square h-48 w-full max-w-50"
      >
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => [`${value} sipariş`, String(name)]}
              />
            }
          />
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            strokeWidth={0}
          >
            {segments.map((s) => (
              <Cell key={s.key} fill={s.cssVar} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                const cx = viewBox.cx ?? 0;
                const cy = viewBox.cy ?? 0;
                return (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={cx}
                      y={cy - 6}
                      className="fill-foreground text-2xl font-bold tabular-nums"
                    >
                      {total.toLocaleString("tr-TR")}
                    </tspan>
                    <tspan
                      x={cx}
                      y={cy + 14}
                      className="fill-muted-foreground text-[11px]"
                    >
                      sipariş
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="flex items-center justify-center gap-1 text-xs">
        <span className="text-muted-foreground">Teslim oranı</span>
        <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
          <ArrowUpRight className="size-3" />
          {deliveredPct.toFixed(1)}%
        </span>
      </div>

      <ul className="space-y-1.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-sm"
              style={{ background: s.cssVar }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {s.name}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {s.pct.toFixed(0)}%
            </span>
            <span className="w-6 text-right font-medium tabular-nums">
              {s.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Top products ──────────────────────────────────────────────────

function TopProductsBlock({
  products,
}: {
  products: TrendyolDashboardStats["topProducts"];
}) {
  if (products.length === 0) {
    return <EmptyState icon={ShoppingBag} text="Bu dönemde sipariş yok" />;
  }

  const top5 = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const maxQty = Math.max(...top5.map((p) => p.quantity), 1);

  return (
    <ul className="space-y-3">
      {top5.map((p, i) => {
        const pct = (p.quantity / maxQty) * 100;
        return (
          <li key={p.name} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                ×{p.quantity}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(pct, 4)}%`,
                  background: `var(--chart-${(i % 5) + 1})`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Finance flow ──────────────────────────────────────────────────

function FinanceFlow({ finance }: { finance: TrendyolDashboardStats["finance"] }) {
  const rows: {
    label: string;
    value: number;
    cssVar: string;
    negative?: boolean;
    highlight?: boolean;
    separatorBefore?: boolean;
  }[] = [
    { label: "Brüt Satış (online)",       value: finance.grossSales,      cssVar: "var(--chart-1)" },
    { label: "İndirim",                   value: finance.totalDiscount,   cssVar: "var(--chart-3)", negative: true },
    { label: "Kupon",                     value: finance.totalCoupon,     cssVar: "var(--chart-4)", negative: true },
    { label: "İade",                      value: finance.totalRefund,     cssVar: "var(--destructive)", negative: true },
    { label: "Komisyon",                  value: finance.totalCommission, cssVar: "var(--chart-2)", negative: true },
    { label: "Net Hakediş (online)",      value: finance.netRevenue,      cssVar: "var(--chart-5)", separatorBefore: true },
    { label: "Yemek Kartı Net (tahmini)", value: finance.mealCardNet,     cssVar: "var(--chart-4)" },
    { label: "Tahmini Toplam Hakediş",    value: finance.totalNet,        cssVar: "var(--chart-5)", highlight: true, separatorBefore: true },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        return (
          <li key={r.label} className="space-y-1.5">
            {r.separatorBefore && <Separator className="my-1" />}
            <div className="flex items-center justify-between gap-2 text-sm">
              <span
                className={`text-xs font-medium ${
                  r.highlight ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {r.label}
              </span>
              <span
                className={`tabular-nums ${
                  r.highlight
                    ? "text-base font-bold text-foreground"
                    : "text-sm font-semibold"
                }`}
              >
                {r.negative && r.value > 0 ? "−" : ""}
                {formatCurrency(r.value)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: r.cssVar,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Meal card list ────────────────────────────────────────────────

type MealCardItem = TrendyolDashboardStats["mealCardBreakdown"][number];

function MealCardList({ items }: { items: MealCardItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={CreditCard} text="Yemek kartı ödemesi yok" />;
  }
  const total = items.reduce((s, i) => s + i.revenue, 0);
  return (
    <ul className="space-y-3">
      {items.map((i, idx) => {
        const pct = total > 0 ? (i.revenue / total) * 100 : 0;
        return (
          <li key={i.brand} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{i.brand}</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(i.revenue)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: `var(--chart-${(idx % 5) + 1})`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
