"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrderStore } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingBag,
  ClipboardList,
  TrendingUp,
  Clock,
  CheckCircle2,
  Bike,
  PlusCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { type Order } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  Order["status"],
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: { label: "Beklemede", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  preparing: {
    label: "Hazırlanıyor",
    color: "bg-blue-100 text-blue-800",
    icon: ClipboardList,
  },
  "on-the-way": { label: "Yolda", color: "bg-purple-100 text-purple-800", icon: Bike },
  delivered: {
    label: "Teslim Edildi",
    color: "bg-green-100 text-green-800",
    icon: CheckCircle2,
  },
  cancelled: { label: "İptal", color: "bg-red-100 text-red-800", icon: ClipboardList },
};

export default function DashboardPage() {
  const router = useRouter();
  const { orders, loadOrders, isLoading } = useOrderStore();

  useEffect(() => {
    loadOrders();

    // Sekme tekrar aktif olunca veya sayfa focus'a gelince yenile
    const handleFocus = () => loadOrders();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "preparing" | "on-the-way"
  >("all");

  const { todayOrders, yesterdayOrders, todayRevenue, yesterdayRevenue, hourly } =
    useMemo(() => {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const todayStr = today.toDateString();
      const yesterdayStr = yesterday.toDateString();

      const todayOrders = orders.filter(
        (o) => new Date(o.createdAt).toDateString() === todayStr,
      );
      const yesterdayOrders = orders.filter(
        (o) => new Date(o.createdAt).toDateString() === yesterdayStr,
      );

      const sumRevenue = (list: typeof orders) =>
        list
          .filter((o) => o.status !== "cancelled")
          .reduce((sum, o) => sum + o.total, 0);

      // 24 saatlik dağılım (bugün)
      const hourly = Array.from({ length: 24 }, () => 0);
      todayOrders.forEach((o) => {
        const h = new Date(o.createdAt).getHours();
        hourly[h] += 1;
      });

      return {
        todayOrders,
        yesterdayOrders,
        todayRevenue: sumRevenue(todayOrders),
        yesterdayRevenue: sumRevenue(yesterdayOrders),
        hourly,
      };
    }, [orders]);

  const allActiveOrders = orders.filter(
    (o) =>
      o.status === "pending" || o.status === "preparing" || o.status === "on-the-way",
  );

  const activeOrders =
    statusFilter === "all"
      ? allActiveOrders
      : allActiveOrders.filter((o) => o.status === statusFilter);

  const recentOrders = orders.slice(0, 10);

  const orderDelta = computeDelta(todayOrders.length, yesterdayOrders.length);
  const revenueDelta = computeDelta(todayRevenue, yesterdayRevenue);

  return (
    <main className="h-full flex flex-col px-3 pt-3 pb-6 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 lg:pb-8 overflow-y-auto lg:overflow-hidden">
      {/* Başlık */}
      <div className="mb-4 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Kontrol Paneli</h1>
          <p
            className="text-xs sm:text-sm mt-0.5 text-muted-foreground truncate"
            suppressHydrationWarning
          >
            <span className="hidden sm:inline">
              {new Date().toLocaleDateString("tr-TR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <span className="sm:hidden">
              {new Date().toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </p>
        </div>
        <Button
          size="sm"
          className="sm:h-9 sm:px-4 shrink-0"
          onClick={() => router.push("/orders/new")}
        >
          <PlusCircle className="mr-1.5 sm:mr-2 h-4 w-4" />
          <span>Yeni Sipariş</span>
        </Button>
      </div>

      {/* İstatistik kartları */}
      <div className="mb-4 grid gap-2.5 sm:gap-3 grid-cols-2 lg:grid-cols-4 shrink-0">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-6">
                  <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-3 w-20 sm:w-24" />
                    <Skeleton className="h-6 sm:h-7 w-14 sm:w-16" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Bugünkü Siparişler"
              value={todayOrders.length.toString()}
              icon={ShoppingBag}
              color="text-blue-600"
              bg="bg-blue-50"
              delta={orderDelta}
            />
            <StatCard
              title="Bugünkü Ciro"
              value={formatCurrency(todayRevenue)}
              icon={TrendingUp}
              color="text-green-600"
              bg="bg-green-50"
              delta={revenueDelta}
            />
            <StatCard
              title="Aktif Siparişler"
              value={allActiveOrders.length.toString()}
              icon={Clock}
              color="text-yellow-600"
              bg="bg-yellow-50"
            />
            <StatCard
              title="Toplam Siparişler"
              value={orders.length.toString()}
              icon={ClipboardList}
              color="text-purple-600"
              bg="bg-purple-50"
            />
          </>
        )}
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3 lg:flex-1 lg:min-h-0">
        {/* Aktif siparişler */}
        <div className="lg:col-span-2 flex flex-col lg:min-h-0">
          <Card className="flex flex-col flex-1 lg:min-h-0">
            <CardHeader className="flex flex-col gap-3 shrink-0 pb-3">
              <div className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Aktif Siparişler</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{activeOrders.length} sipariş</Badge>
                  <Link
                    href="/orders"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
                  >
                    Tümü →
                  </Link>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 -mx-1 px-1 overflow-x-auto scrollbar-hide">
                {STATUS_FILTERS.map((f) => {
                  const count =
                    f.key === "all"
                      ? allActiveOrders.length
                      : allActiveOrders.filter((o) => o.status === f.key).length;
                  const isActive = statusFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setStatusFilter(f.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                        isActive
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:bg-muted/70",
                      )}
                    >
                      {f.label}
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] font-semibold",
                          isActive
                            ? "bg-background/20 text-background"
                            : "bg-background/60 text-foreground",
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="flex-1 pb-4 lg:min-h-0 lg:overflow-y-auto scrollbar-hide">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle2 className="mb-3 h-12 w-12 opacity-30" />
                  <p className="text-sm">Şu anda aktif sipariş yok</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeOrders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Yan panel */}
        <div className="flex flex-col gap-3 sm:gap-4 lg:min-h-0">
          <Card>
            <CardHeader className="shrink-0 pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Bugünün Trafiği</CardTitle>
              <span className="text-xs text-muted-foreground">
                {todayOrders.length} sipariş · 24 saat
              </span>
            </CardHeader>
            <CardContent className="pb-4">
              <HourlyTraffic hourly={hourly} />
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col lg:flex-1 lg:min-h-0">
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="text-base">Hızlı İşlemler</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pb-4 flex-1 lg:min-h-0">
              <Button
                className="w-full justify-start"
                onClick={() => router.push("/orders/new")}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Yeni Sipariş Al
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push("/orders")}
              >
                <ClipboardList className="mr-2 h-4 w-4" />
                Tüm Siparişler
              </Button>
              <Separator />
              <div className="flex items-center justify-between shrink-0">
                <div className="text-sm font-medium text-muted-foreground">
                  Son Siparişler
                </div>
                {recentOrders.length > 0 && (
                  <>
                    <span className="text-[10px] text-muted-foreground/70 lg:hidden">
                      son {Math.min(recentOrders.length, 5)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70 hidden lg:inline">
                      son {recentOrders.length}
                    </span>
                  </>
                )}
              </div>
              <div className="flex-1 lg:min-h-0 lg:overflow-y-auto scrollbar-hide -mr-2 pr-2">
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md p-2"
                      >
                        <div className="space-y-1.5">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                        <div className="space-y-1.5 items-end flex flex-col">
                          <Skeleton className="h-3 w-14" />
                          <Skeleton className="h-3 w-10" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recentOrders.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Henüz sipariş yok
                  </p>
                ) : (
                  <div className="flex flex-col gap-1 [&>*:nth-child(n+6)]:hidden lg:[&>*:nth-child(n+6)]:flex">
                    {recentOrders.map((order) => (
                      <Link
                        key={order.id}
                        href={`/orders/${order.id}`}
                        className="flex items-center justify-between rounded-md p-2 text-sm transition-colors hover:bg-accent shrink-0"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">#{order.orderNumber}</span>
                          <span className="ml-2 text-muted-foreground truncate">
                            {order.customer.name}
                          </span>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="font-medium">{formatCurrency(order.total)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatRelativeTime(order.createdAt)}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
type Delta = { kind: "up" | "down" | "flat" | "new"; pct: number };

function computeDelta(current: number, previous: number): Delta {
  if (previous === 0 && current === 0) return { kind: "flat", pct: 0 };
  if (previous === 0) return { kind: "new", pct: 100 };
  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 1) return { kind: "flat", pct: 0 };
  return { kind: diff > 0 ? "up" : "down", pct: Math.round(Math.abs(diff)) };
}

// ─── Alt Bileşenler ────────────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  icon: Icon,
  color,
  bg,
  delta,
}: {
  title: string;
  value: string;
  delta?: Delta;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-6">
        <div className={`rounded-xl p-2.5 sm:p-3 ${bg} shrink-0`}>
          <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-lg sm:text-2xl font-bold truncate">{value}</p>
            {delta && <DeltaBadge delta={delta} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.kind === "flat") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-medium text-muted-foreground">
        <Minus className="h-3 w-3" />
        eşit
      </span>
    );
  }
  if (delta.kind === "new") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-medium text-emerald-600">
        <ArrowUpRight className="h-3 w-3" />
        yeni
      </span>
    );
  }
  const isUp = delta.kind === "up";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-medium",
        isUp ? "text-emerald-600" : "text-red-600",
      )}
    >
      {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      %{delta.pct}
    </span>
  );
}

function HourlyTraffic({ hourly }: { hourly: number[] }) {
  const max = Math.max(1, ...hourly);
  const currentHour = new Date().getHours();
  return (
    <div className="flex items-end gap-0.5 h-16">
      {hourly.map((count, h) => {
        const heightPct = (count / max) * 100;
        const isCurrent = h === currentHour;
        const isPast = h <= currentHour;
        return (
          <div
            key={h}
            className="flex-1 flex flex-col items-center gap-1 group relative"
            title={`${h.toString().padStart(2, "0")}:00 — ${count} sipariş`}
          >
            <div className="w-full flex-1 flex items-end">
              <div
                className={cn(
                  "w-full rounded-sm transition-all",
                  count === 0
                    ? "bg-muted/40"
                    : isCurrent
                      ? "bg-blue-500"
                      : isPast
                        ? "bg-blue-400/70"
                        : "bg-muted",
                )}
                style={{ height: count === 0 ? "4px" : `${Math.max(heightPct, 8)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const STATUS_FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Bekleyen" },
  { key: "preparing", label: "Hazırlanıyor" },
  { key: "on-the-way", label: "Yolda" },
] as const;

function OrderRow({ order }: { order: Order }) {
  const config = statusConfig[order.status];
  const Icon = config.icon;
  return (
    <Link
      href={`/orders/${order.id}`}
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="text-sm min-w-0 flex items-center flex-wrap gap-x-2">
          <span className="font-semibold">#{order.orderNumber}</span>
          <span className="text-muted-foreground hidden sm:inline">·</span>
          <span className="truncate">{order.customer.name}</span>
        </div>
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
        <span className="text-sm font-medium">{formatCurrency(order.total)}</span>
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${config.color}`}
        >
          <Icon className="h-3 w-3" />
          {config.label}
        </span>
      </div>
    </Link>
  );
}
