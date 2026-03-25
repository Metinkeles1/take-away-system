"use client";

import Link from "next/link";
import { useEffect } from "react";
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
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { type Order } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";

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

  const todayOrders = orders.filter((o) => {
    const orderDate = new Date(o.createdAt);
    const today = new Date();
    return orderDate.toDateString() === today.toDateString();
  });

  const todayRevenue = todayOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);

  const activeOrders = orders.filter(
    (o) =>
      o.status === "pending" || o.status === "preparing" || o.status === "on-the-way",
  );

  const recentOrders = orders.slice(0, 8);

  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-4 pb-4 overflow-hidden">
      {/* Başlık */}
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kontrol Paneli</h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            {new Date().toLocaleDateString("tr-TR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <Button size="default" onClick={() => router.push("/orders/new")}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Yeni Sipariş
        </Button>
      </div>

      {/* İstatistik kartları */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 shrink-0">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-4 p-6">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-16" />
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
            />
            <StatCard
              title="Bugünkü Ciro"
              value={formatCurrency(todayRevenue)}
              icon={TrendingUp}
              color="text-green-600"
              bg="bg-green-50"
            />
            <StatCard
              title="Aktif Siparişler"
              value={activeOrders.length.toString()}
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

      <div className="flex-1 min-h-0 grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* Aktif siparişler */}
        <div className="lg:col-span-2 flex flex-col min-h-0 lg:max-h-[calc(100vh-13rem)]">
          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader className="flex flex-row items-center justify-between shrink-0 pb-3">
              <CardTitle className="text-base">Aktif Siparişler</CardTitle>
              <Badge variant="secondary">{activeOrders.length} sipariş</Badge>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-4">
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

        {/* Hızlı işlemler */}
        <div>
          <Card>
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="text-base">Hızlı İşlemler</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pb-4">
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
              <div className="text-sm font-medium text-muted-foreground">
                Son Siparişler
              </div>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
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
                recentOrders.slice(0, 5).map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-between rounded-md p-2 text-sm transition-colors hover:bg-accent"
                  >
                    <div>
                      <span className="font-medium">#{order.orderNumber}</span>
                      <span className="ml-2 text-muted-foreground">
                        {order.customer.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(order.total)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

// ─── Alt Bileşenler ────────────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  icon: Icon,
  color,
  bg,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className={`rounded-xl p-3 ${bg}`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderRow({ order }: { order: Order }) {
  const config = statusConfig[order.status];
  const Icon = config.icon;
  return (
    <Link
      href={`/orders/${order.id}`}
      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-3">
        <div className="text-sm">
          <span className="font-semibold">#{order.orderNumber}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span>{order.customer.name}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
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
