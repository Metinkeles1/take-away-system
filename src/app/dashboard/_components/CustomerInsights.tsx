"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, MapPin, TrendingUp, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCurrency } from "@/lib/utils";
import { type DashboardStats } from "@/actions/dashboard";

interface Props {
  stats: DashboardStats | null;
  isLoading: boolean;
}

const PAYMENT_META: Record<string, { label: string; color: string }> = {
  cash: { label: "Nakit", color: "#10b981" },
  card: { label: "Kart", color: "#3b82f6" },
  online: { label: "Online", color: "#a855f7" },
  meal_card: { label: "Yemek K.", color: "#f97316" },
  iban: { label: "IBAN", color: "#06b6d4" },
};

export function CustomerInsights({ stats, isLoading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Müşteri & İşletme İçgörüleri</CardTitle>
        <CardDescription>
          Büyüme, ödeme alışkanlıkları ve bölgesel dağılım
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="growth" className="gap-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="growth">
              <TrendingUp className="size-3.5" />
              <span>Büyüme</span>
            </TabsTrigger>
            <TabsTrigger value="payments">
              <Users className="size-3.5" />
              <span>Ödemeler</span>
            </TabsTrigger>
            <TabsTrigger value="regions">
              <MapPin className="size-3.5" />
              <span>Bölgeler</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="growth">
            <GrowthView stats={stats} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsView stats={stats} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="regions">
            <RegionsView stats={stats} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Growth ──────────────────────────────────────────────────────────────

function GrowthView({ stats, isLoading }: Props) {
  const data = useMemo(
    () =>
      (stats?.monthlyTrend ?? []).slice(-6).map((m) => ({
        label: m.label,
        orders: m.orders,
        customers: m.customers,
      })),
    [stats?.monthlyTrend],
  );

  const totalCustomers = stats?.totalCustomerCount ?? 0;
  const monthsAll = stats?.monthlyTrend ?? [];
  const cur = monthsAll[monthsAll.length - 1]?.customers ?? 0;
  const prev = monthsAll[monthsAll.length - 2]?.customers ?? 0;
  const custDelta = prev === 0 ? null : ((cur - prev) / prev) * 100;

  const statusTotal = Object.values(stats?.statusBreakdown ?? {}).reduce(
    (s, v) => s + v,
    0,
  );
  const delivered = stats?.statusBreakdown?.delivered ?? 0;
  const completion = statusTotal > 0 ? (delivered / statusTotal) * 100 : 0;

  const avgBasket =
    stats && stats.totalOrderCount > 0
      ? stats.totalRevenue / stats.totalOrderCount
      : 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Son 6 Ay — Sipariş & Müşteri
        </p>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 256 }}
            >
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  cursor={{ className: "fill-muted/60" }}
                  content={<GrowthTooltip />}
                />
                <Bar
                  dataKey="orders"
                  fill="#3b82f6"
                  radius={[3, 3, 0, 0]}
                  name="Sipariş"
                />
                <Bar
                  dataKey="customers"
                  fill="#10b981"
                  radius={[3, 3, 0, 0]}
                  name="Benzersiz Müşteri"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Anahtar Metrikler</p>
        <MetricCard
          icon={Users}
          label="Toplam Müşteri"
          value={totalCustomers.toLocaleString("tr-TR")}
          delta={custDelta}
          deltaLabel="bu ay"
          loading={isLoading}
        />
        <MetricCard
          icon={ArrowUpRight}
          label="Tamamlama Oranı"
          value={`${completion.toFixed(1)}%`}
          delta={null}
          deltaLabel="teslim oranı"
          loading={isLoading}
        />
        <MetricCard
          icon={TrendingUp}
          label="Ortalama Sepet"
          value={formatCurrency(avgBasket)}
          delta={null}
          deltaLabel="tüm zamanlar"
          loading={isLoading}
        />
      </div>
    </div>
  );
}

function GrowthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload: { label: string };
  }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium">{payload[0].payload.label}</p>
      {payload.map((p) => (
        <div
          key={p.name}
          className="mt-0.5 flex items-center gap-1.5 tabular-nums"
        >
          <span className="size-2 rounded-xs" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Payments ────────────────────────────────────────────────────────────

function PaymentsView({ stats, isLoading }: Props) {
  const data = useMemo(() => {
    const raw: Record<string, number> = stats?.paymentBreakdownAll ?? {};
    return Object.entries(raw)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        key,
        label: PAYMENT_META[key]?.label ?? key,
        color: PAYMENT_META[key]?.color ?? "#94a3b8",
        value,
      }));
  }, [stats?.paymentBreakdownAll]);

  const total = data.reduce((s, x) => s + x.value, 0);
  const top = [...data].sort((a, b) => b.value - a.value)[0];
  const activeMethods = data.length;
  const avgPerMethod = activeMethods > 0 ? total / activeMethods : 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Ödeme Yöntemine Göre Ciro
        </p>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Henüz ödeme verisi yok.
          </p>
        ) : (
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 256 }}
            >
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-muted-foreground"
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip
                  cursor={{ className: "fill-muted/60" }}
                  content={<PaymentTooltip total={total} />}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          Anahtar Metrikler
        </p>
        <MetricCard
          label="Baskın Yöntem"
          value={top?.label ?? "—"}
          delta={null}
          deltaLabel={
            top && total > 0 ? `${((top.value / total) * 100).toFixed(0)}% pay` : ""
          }
          loading={isLoading}
        />
        <MetricCard
          label="Aktif Yöntem"
          value={String(activeMethods)}
          delta={null}
          deltaLabel="kullanımda"
          loading={isLoading}
        />
        <MetricCard
          label="Yöntem Başına Ort."
          value={formatCurrency(avgPerMethod)}
          delta={null}
          deltaLabel="ciro"
          loading={isLoading}
        />
      </div>
    </div>
  );
}

function PaymentTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { label: string; value: number; color: string };
  }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? (d.value / total) * 100 : 0;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-xs" style={{ background: d.color }} />
        <span className="font-medium">{d.label}</span>
      </div>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        {formatCurrency(d.value)} · {pct.toFixed(0)}%
      </p>
    </div>
  );
}

// ─── Regions ─────────────────────────────────────────────────────────────

function RegionsView({ stats, isLoading }: Props) {
  const data = useMemo(
    () => (stats?.regionBreakdown ?? []).slice(0, 6),
    [stats?.regionBreakdown],
  );

  const totalOrders = data.reduce((s, r) => s + r.orderCount, 0);
  const top = data[0];
  const richest = data.reduce<typeof data[number] | undefined>(
    (a, b) => (!a || b.avgBasket > a.avgBasket ? b : a),
    undefined,
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          En Yoğun 6 Bölge
        </p>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Bölge verisi yok. (Siparişlerde district alanı dolmamış.)
          </p>
        ) : (
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 256 }}
            >
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide domain={[0, "dataMax"]} />
                <YAxis
                  dataKey="district"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  width={100}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-foreground"
                />
                <Tooltip
                  cursor={{ className: "fill-muted/60" }}
                  content={<RegionTooltip />}
                />
                <Bar
                  dataKey="orderCount"
                  radius={[0, 3, 3, 0]}
                  className="fill-primary"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          Anahtar Metrikler
        </p>
        <MetricCard
          label="Aktif Bölge"
          value={String(stats?.regionBreakdown?.length ?? 0)}
          delta={null}
          deltaLabel="district kayıtlı"
          loading={isLoading}
        />
        <MetricCard
          label="En Yoğun Bölge"
          value={top?.district ?? "—"}
          delta={null}
          deltaLabel={
            top && totalOrders > 0
              ? `${((top.orderCount / totalOrders) * 100).toFixed(0)}% pay`
              : ""
          }
          loading={isLoading}
        />
        <MetricCard
          label="En Yüksek Ort. Sepet"
          value={richest ? formatCurrency(richest.avgBasket) : "—"}
          delta={null}
          deltaLabel={richest?.district}
          loading={isLoading}
        />
      </div>
    </div>
  );
}

function RegionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { district: string; orderCount: number; avgBasket: number; revenue: number };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium">{d.district}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        {d.orderCount} sipariş · {formatCurrency(d.revenue)}
      </p>
      <p className="tabular-nums text-muted-foreground">
        Ort. sepet {formatCurrency(d.avgBasket)}
      </p>
    </div>
  );
}

// ─── Metric card ─────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaLabel,
  loading,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  delta: number | null;
  deltaLabel?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        <span>{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-24" />
      ) : (
        <p className="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums">
          {value}
        </p>
      )}
      {(delta !== null || deltaLabel) && !loading && (
        <div className="mt-0.5 flex items-center gap-1 text-[11px]">
          {delta !== null && (
            <span
              className={cn(
                "font-semibold tabular-nums",
                delta >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            >
              {delta >= 0 ? "+" : "−"}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {deltaLabel && (
            <span className="truncate text-muted-foreground">{deltaLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
