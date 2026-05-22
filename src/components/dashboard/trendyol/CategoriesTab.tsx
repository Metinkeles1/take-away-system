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
} from "recharts";
import {
  getTrendyolCategoryStats,
  type TrendyolCategoryStats,
  type TrendyolPeriod,
} from "@/actions/trendyolCategoryStats";
import {
  AlertTriangle,
  Layers,
  Trophy,
  Wallet,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency } from "@/lib/utils";

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

type SortKey = "quantity" | "revenue" | "orderCount" | "productCount" | "name";

export function CategoriesTab() {
  const [period, setPeriod] = useState<TrendyolPeriod>("today");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [todayValue, setTodayValue] = useState<string>("");
  const [stats, setStats] = useState<TrendyolCategoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("quantity");

  useEffect(() => {
    const t = toDateInputValue(new Date());
    setTodayValue(t);
    setSelectedDate(t);
  }, []);

  const isToday = selectedDate === todayValue && todayValue !== "";

  const load = useCallback(async () => {
    if (!selectedDate) return;
    setIsLoading(true);
    try {
      const refTs = parseDateInputValue(selectedDate).getTime();
      const data = await getTrendyolCategoryStats(period, refTs);
      setStats(data);
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedDate]);

  useEffect(() => {
    if (selectedDate) load();
  }, [load, selectedDate]);

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

  const sorted = useMemo(() => {
    if (!stats) return [];
    const arr = [...stats.categories];
    arr.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "tr");
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
    return arr;
  }, [stats, sortKey]);

  const topByQuantity = stats?.categories[0];
  const topByRevenue = useMemo(() => {
    if (!stats?.categories.length) return null;
    return [...stats.categories].sort((a, b) => b.revenue - a.revenue)[0];
  }, [stats]);
  const avgRevenue =
    stats && stats.categories.length > 0
      ? stats.totalRevenue / stats.categories.length
      : 0;

  const softLoading = isLoading && !!stats;

  return (
    <div className="relative space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">Kategoriler</h2>
          <p className="text-sm text-muted-foreground">
            {periodLabel} · Kategori bazlı satış kırılımı
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as TrendyolPeriod)}>
            <TabsList>
              <TabsTrigger value="today" disabled={isLoading}>Bugün</TabsTrigger>
              <TabsTrigger value="week" disabled={isLoading}>7 Gün</TabsTrigger>
              <TabsTrigger value="month" disabled={isLoading}>30 Gün</TabsTrigger>
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
            onClick={load}
            disabled={isLoading}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Yenile</span>
          </Button>
        </div>
      </div>

      {stats?.error && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              {stats.menuAvailable
                ? "Menü API uyarısı"
                : "Kategori verisi alınamadı — tümü \"Kategorisiz\""}
            </p>
            <p className="mt-0.5 text-xs">{stats.error}</p>
          </div>
        </div>
      )}

      <div
        className={`space-y-4 transition-opacity ${softLoading ? "opacity-60 pointer-events-none" : "opacity-100"}`}
        aria-busy={softLoading}
      >
        {/* KPI row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Toplam Kategori"
            value={stats?.categories.length}
            valueFormat="number"
            isLoading={isLoading && !stats}
            icon={Layers}
            footer={stats ? `${stats.totalOrders} sipariş` : ""}
          />
          <KpiCard
            label="En Çok Satan Kategori"
            value={topByQuantity?.quantity}
            valueFormat="number"
            isLoading={isLoading && !stats}
            icon={Trophy}
            footer={topByQuantity ? `${topByQuantity.name} · ${topByQuantity.quantity} adet` : ""}
            truncateFooter
          />
          <KpiCard
            label="En Yüksek Ciro"
            value={topByRevenue?.revenue}
            valueFormat="currency"
            isLoading={isLoading && !stats}
            icon={Wallet}
            footer={topByRevenue ? topByRevenue.name : ""}
            truncateFooter
          />
          <KpiCard
            label="Ortalama Kategori Cirosu"
            value={avgRevenue}
            valueFormat="currency"
            isLoading={isLoading && !stats}
            icon={Wallet}
            footer={stats ? `${stats.categories.length} kategori` : ""}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Adet Bazlı Sıralama</CardTitle>
              <CardDescription>En çok sipariş edilen 10 kategori</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-72 w-full" />
              ) : stats && stats.categories.length > 0 ? (
                <CategoryBarChart
                  rows={stats.categories.slice(0, 10)}
                  metric="quantity"
                />
              ) : (
                <EmptyState icon={ShoppingBag} text="Bu dönemde sipariş yok" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ciro Bazlı Sıralama</CardTitle>
              <CardDescription>En yüksek ciro getiren 10 kategori</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-72 w-full" />
              ) : stats && stats.categories.length > 0 ? (
                <CategoryBarChart
                  rows={[...stats.categories].sort((a, b) => b.revenue - a.revenue).slice(0, 10)}
                  metric="revenue"
                />
              ) : (
                <EmptyState icon={Wallet} text="Bu dönemde sipariş yok" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Share pie + detay tablo */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Ciro Payı</CardTitle>
              <CardDescription>Kategorilerin toplam ciro içindeki payı</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-72 w-full" />
              ) : stats && stats.categories.length > 0 ? (
                <CategorySharePie rows={stats.categories} total={stats.totalRevenue} />
              ) : (
                <EmptyState icon={Wallet} text="Veri yok" />
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Detay</CardTitle>
              <CardDescription>
                Tıklayarak sırala · {sorted.length} kategori
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !stats ? (
                <Skeleton className="h-72 w-full" />
              ) : stats && sorted.length > 0 ? (
                <CategoryTable
                  rows={sorted}
                  totalQuantity={stats.totalQuantity}
                  totalRevenue={stats.totalRevenue}
                  sortKey={sortKey}
                  onSort={setSortKey}
                />
              ) : (
                <EmptyState icon={Layers} text="Kategori verisi yok" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  valueFormat,
  isLoading,
  icon: Icon,
  footer,
  truncateFooter = false,
}: {
  label: string;
  value: number | undefined;
  valueFormat: "number" | "currency";
  isLoading: boolean;
  icon: React.ComponentType<{ className?: string }>;
  footer: string;
  truncateFooter?: boolean;
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
        <CardDescription className="text-sm font-medium text-muted-foreground">
          {label}
        </CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <p className="text-2xl font-bold tabular-nums tracking-tight">{display}</p>
        )}
        {isLoading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <p
            className={`text-xs text-muted-foreground ${truncateFooter ? "truncate" : ""}`}
            title={truncateFooter ? footer : undefined}
          >
            {footer}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Horizontal bar chart (top 10) ─────────────────────────────────

type CategoryRow = {
  name: string;
  quantity: number;
  revenue: number;
  orderCount: number;
  productCount: number;
};

const barChartConfig = {
  value: { label: "Değer", color: "var(--chart-2)" },
} satisfies ChartConfig;

function CategoryBarChart({
  rows,
  metric,
}: {
  rows: CategoryRow[];
  metric: "quantity" | "revenue";
}) {
  const data = rows.map((r) => ({
    name: r.name,
    value: metric === "quantity" ? r.quantity : Math.round(r.revenue),
    quantity: r.quantity,
    revenue: r.revenue,
  }));

  return (
    <ChartContainer config={barChartConfig} className="aspect-auto h-72 w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" strokeOpacity={0.3} />
        <XAxis type="number" axisLine={false} tickLine={false} fontSize={11} />
        <YAxis
          type="category"
          dataKey="name"
          axisLine={false}
          tickLine={false}
          fontSize={11}
          width={110}
          tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
              formatter={(_, __, item) => {
                const qty = item.payload?.quantity ?? 0;
                const rev = item.payload?.revenue ?? 0;
                return [`${qty} adet · ${formatCurrency(Number(rev))}`, ""];
              }}
              indicator="dot"
            />
          }
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={`var(--chart-${(i % 5) + 1})`} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ─── Revenue share pie ─────────────────────────────────────────────

function CategorySharePie({
  rows,
  total,
}: {
  rows: CategoryRow[];
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="flex h-72 items-center justify-center">
        <EmptyState icon={Wallet} text="Ciro yok" />
      </div>
    );
  }
  // İlk 7 + diğerleri "Diğer" altında topla
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const TOP = 7;
  const top = sorted.slice(0, TOP);
  const rest = sorted.slice(TOP);
  const segments = [
    ...top.map((r, i) => ({
      name: r.name,
      value: r.revenue,
      cssVar: `var(--chart-${(i % 5) + 1})`,
    })),
    ...(rest.length > 0
      ? [
          {
            name: `Diğer (${rest.length})`,
            value: rest.reduce((s, r) => s + r.revenue, 0),
            cssVar: "var(--muted-foreground)",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <ChartContainer config={{}} className="mx-auto aspect-square h-56 w-full max-w-56">
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  String(name),
                ]}
              />
            }
          />
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={88}
            paddingAngle={2}
            strokeWidth={0}
          >
            {segments.map((s, i) => (
              <Cell key={i} fill={s.cssVar} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="space-y-1.5">
        {segments.map((s) => {
          const pct = (s.value / total) * 100;
          return (
            <li key={s.name} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ background: s.cssVar }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {s.name}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Detail table ──────────────────────────────────────────────────

function CategoryTable({
  rows,
  totalQuantity,
  totalRevenue,
  sortKey,
  onSort,
}: {
  rows: CategoryRow[];
  totalQuantity: number;
  totalRevenue: number;
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
}) {
  const headerBtn = (k: SortKey, label: string, align: "left" | "right" = "right") => (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`flex w-full items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition hover:text-foreground ${
        align === "right" ? "justify-end" : "justify-start"
      } ${sortKey === k ? "text-foreground" : ""}`}
    >
      {label}
      {sortKey === k && <span aria-hidden>↓</span>}
    </button>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            <th className="py-2 text-left">{headerBtn("name", "Kategori", "left")}</th>
            <th className="py-2 text-right">{headerBtn("quantity", "Adet")}</th>
            <th className="py-2 text-right hidden sm:table-cell">
              {headerBtn("orderCount", "Sipariş")}
            </th>
            <th className="py-2 text-right">{headerBtn("revenue", "Ciro")}</th>
            <th className="py-2 text-right hidden md:table-cell">
              {headerBtn("productCount", "Ürün")}
            </th>
            <th className="py-2 pl-3 text-right text-[11px] uppercase tracking-wide text-muted-foreground">
              Pay
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const qtyPct = totalQuantity > 0 ? (r.quantity / totalQuantity) * 100 : 0;
            const revPct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
            return (
              <tr key={r.name} className="border-b last:border-b-0">
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="size-2 shrink-0 rounded-sm"
                      style={{ background: `var(--chart-${(i % 5) + 1})` }}
                    />
                    <span className="truncate font-medium">{r.name}</span>
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums">{r.quantity}</td>
                <td className="py-2 text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                  {r.orderCount}
                </td>
                <td className="py-2 text-right tabular-nums font-medium">
                  {formatCurrency(r.revenue)}
                </td>
                <td className="py-2 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                  {r.productCount}
                </td>
                <td className="py-2 pl-3 text-right">
                  <div className="inline-flex flex-col items-end gap-0.5">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {sortKey === "revenue" ? `${revPct.toFixed(1)}%` : `${qtyPct.toFixed(1)}%`}
                    </span>
                    <span className="block h-1 w-16 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(sortKey === "revenue" ? revPct : qtyPct, 2)}%`,
                          background: `var(--chart-${(i % 5) + 1})`,
                        }}
                      />
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
