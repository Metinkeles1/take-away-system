"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  ShoppingBag,
  Wallet,
  Receipt,
  Flame,
  TrendingDown,
} from "lucide-react";
import {
  getTrendyolSalesAnalytics,
  type SalesAnalytics,
  type AnalyticsPeriod,
} from "@/actions/trendyolAnalytics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  week: "Son 7 Gün",
  month: "Son 30 Gün",
  quarter: "Son 90 Gün",
};

const DOW_LABEL = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default function TrendyolSalesPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const [data, setData] = useState<SalesAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await getTrendyolSalesAnalytics(period));
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">Satış Analitiği</h2>
          <p className="text-sm text-muted-foreground">
            {PERIOD_LABEL[period]} · Trend, ısı haritası ve top ürün
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as AnalyticsPeriod)}>
            <TabsList>
              <TabsTrigger value="week" disabled={isLoading}>7 Gün</TabsTrigger>
              <TabsTrigger value="month" disabled={isLoading}>30 Gün</TabsTrigger>
              <TabsTrigger value="quarter" disabled={isLoading}>90 Gün</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={load} disabled={isLoading} className="h-8 gap-1.5">
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>
      </div>

      {data?.error && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Veri alınamadı</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{data.error}</p>
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Toplam Sipariş"
          value={data ? data.totalOrders.toLocaleString("tr-TR") : null}
          icon={ShoppingBag}
          footer={data?.bestDay ? `En iyi: ${data.bestDay.label}` : ""}
          loading={isLoading && !data}
        />
        <KpiCard
          label="Toplam Ciro"
          value={data ? formatCurrency(data.totalRevenue) : null}
          icon={Wallet}
          footer={PERIOD_LABEL[period]}
          loading={isLoading && !data}
        />
        <KpiCard
          label="Ortalama Sepet"
          value={data ? formatCurrency(data.avgBasket) : null}
          icon={Receipt}
          footer={data ? `${data.totalOrders} sipariş` : ""}
          loading={isLoading && !data}
        />
        <KpiCard
          label="İptal Oranı"
          value={data ? `${(data.cancelRate * 100).toFixed(1)}%` : null}
          icon={TrendingUp}
          footer={data?.bestHour ? `Peak saat: ${String(data.bestHour.hour).padStart(2, "0")}:00` : ""}
          loading={isLoading && !data}
        />
      </div>

      {/* Daily trend + Top products */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Günlük Trend</CardTitle>
            <CardDescription>
              Ciro ve sipariş adedi · {PERIOD_LABEL[period]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-72 w-full" />
            ) : data && data.daily.some((d) => d.orders > 0) ? (
              <DailyTrendChart daily={data.daily} />
            ) : (
              <div className="flex h-72 items-center justify-center">
                <EmptyState icon={ShoppingBag} text="Bu dönemde veri yok" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>En Çok Satan</CardTitle>
            <CardDescription>İlk 5 · adet bazlı</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-72 w-full" />
            ) : data && data.topProducts.length ? (
              <TopProductsDonut products={data.topProducts.slice(0, 5)} />
            ) : (
              <EmptyState icon={ShoppingBag} text="Veri yok" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Heatmap + Low sellers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Gün × Saat Yoğunluğu</CardTitle>
            <CardDescription>
              Hangi gün ve saat aralığında sipariş yoğunluğu yüksek
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-64 w-full" />
            ) : data && data.heatmap.some((h) => h.orders > 0) ? (
              <Heatmap heatmap={data.heatmap} />
            ) : (
              <div className="flex h-64 items-center justify-center">
                <EmptyState icon={Flame} text="Bu dönemde veri yok" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="size-4 text-muted-foreground" />
              En Az Satan
            </CardTitle>
            <CardDescription>
              En düşük 10 ürün · stok/menü gözden geçirmesi için
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-64 w-full" />
            ) : data && data.lowSellers.length ? (
              <LowSellersList products={data.lowSellers} />
            ) : (
              <EmptyState icon={TrendingDown} text="Veri yok" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Top products donut ─────────────────────────────────────────────

function TopProductsDonut({
  products,
}: {
  products: SalesAnalytics["topProducts"];
}) {
  const data = products.map((p, i) => ({
    name: p.name,
    value: p.quantity,
    revenue: p.revenue,
    fill: `var(--chart-${(i % 5) + 1})`,
  }));
  const totalQty = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-3">
      <ChartContainer
        config={{}}
        className="mx-auto aspect-square h-44 w-full max-w-45"
      >
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name, item) => [
                  `×${value} · ${formatCurrency(Number(item.payload?.revenue ?? 0))}`,
                  String(name),
                ]}
              />
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <ul className="space-y-1.5">
        {data.map((d) => {
          const pct = totalQty > 0 ? (d.value / totalQty) * 100 : 0;
          return (
            <li key={d.name} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ background: d.fill }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {d.name}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {pct.toFixed(0)}%
              </span>
              <span className="w-8 text-right font-medium tabular-nums">
                ×{d.value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Low sellers ────────────────────────────────────────────────────

function LowSellersList({
  products,
}: {
  products: SalesAnalytics["lowSellers"];
}) {
  return (
    <ul className="space-y-2.5">
      {products.map((p, i) => (
        <li
          key={p.name}
          className="flex items-center gap-2.5 rounded-md border bg-card p-2.5"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {formatCurrency(p.revenue)} ciro
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
            ×{p.quantity}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── KPI ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  footer,
  loading,
}: {
  label: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  footer: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <CardDescription className="text-sm font-medium text-muted-foreground">
          {label}
        </CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {value ?? "—"}
          </p>
        )}
        {loading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <p className="text-xs text-muted-foreground">{footer}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Daily trend ────────────────────────────────────────────────────

const trendConfig = {
  revenue: { label: "Ciro", color: "var(--chart-2)" },
  orders:  { label: "Sipariş", color: "var(--chart-4)" },
} satisfies ChartConfig;

function DailyTrendChart({ daily }: { daily: SalesAnalytics["daily"] }) {
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-72 w-full">
      <AreaChart data={daily} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          fontSize={11}
          minTickGap={20}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tickMargin={4}
          fontSize={11}
          width={48}
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => String(label)}
              formatter={(value, _name, item) => {
                const orders = item.payload?.orders ?? 0;
                return [
                  `${formatCurrency(Number(value))} · ${orders} sipariş`,
                  "Ciro",
                ];
              }}
              indicator="line"
            />
          }
        />
        <Area
          dataKey="revenue"
          type="monotone"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          fill="url(#fillRevenue)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

// ─── Heatmap (7×24) ─────────────────────────────────────────────────

function Heatmap({ heatmap }: { heatmap: SalesAnalytics["heatmap"] }) {
  const max = Math.max(...heatmap.map((c) => c.orders), 1);

  // Saat etiketleri: her 3 saatte bir göster
  const hourLabels = useMemo(
    () => Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h).padStart(2, "0") : "")),
    [],
  );

  return (
    <div className="space-y-2">
      <div className="grid" style={{ gridTemplateColumns: "auto repeat(24, minmax(0, 1fr))", gap: "3px" }}>
        <div />
        {hourLabels.map((l, i) => (
          <div key={i} className="text-[10px] text-muted-foreground tabular-nums text-center">
            {l}
          </div>
        ))}
        {DOW_LABEL.map((dowLabel, dow) => (
          <div className="contents" key={dow}>
            <div className="text-[11px] text-muted-foreground pr-2 self-center">
              {dowLabel}
            </div>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = heatmap.find((h) => h.dow === dow && h.hour === hour);
              const orders = cell?.orders ?? 0;
              const intensity = orders === 0 ? 0 : 0.15 + (orders / max) * 0.85;
              return (
                <div
                  key={hour}
                  title={`${dowLabel} ${String(hour).padStart(2, "0")}:00 · ${orders} sipariş`}
                  className="aspect-square rounded-sm"
                  style={{
                    background:
                      orders === 0
                        ? "var(--muted)"
                        : `color-mix(in oklab, var(--chart-2) ${intensity * 100}%, transparent)`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
        <span>az</span>
        <div className="flex gap-0.5">
          {[0.2, 0.4, 0.6, 0.8, 1].map((v) => (
            <div
              key={v}
              className="size-3 rounded-sm"
              style={{
                background: `color-mix(in oklab, var(--chart-2) ${v * 100}%, transparent)`,
              }}
            />
          ))}
        </div>
        <span>çok</span>
      </div>
    </div>
  );
}
