"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrderStore } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingBag,
  ClipboardList,
  TrendingUp,
  Clock,
  PlusCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { StatCard, computeDelta } from "@/components/dashboard/StatCard";
import { HourlyTraffic } from "@/components/dashboard/HourlyTraffic";
import { ActiveOrdersCard } from "@/components/dashboard/ActiveOrdersCard";
import { QuickActionsCard } from "@/components/dashboard/QuickActionsCard";

export default function DashboardPage() {
  const router = useRouter();
  const { orders, loadOrders, isLoading } = useOrderStore();
  const [bootstrapping, setBootstrapping] = useState(orders.length === 0);

  useEffect(() => {
    loadOrders().finally(() => setBootstrapping(false));
    const handleFocus = () => loadOrders();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showSkeleton = isLoading || bootstrapping;

  const {
    todayOrders,
    yesterdayOrders,
    todayRevenue,
    yesterdayRevenue,
    hourly,
  } = useMemo(() => {
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
        list.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.total, 0);

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

  const allActiveOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === "pending" ||
          o.status === "preparing" ||
          o.status === "on-the-way",
      ),
    [orders],
  );

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
        {showSkeleton ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-6">
                <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-3 w-20 sm:w-24" />
                  <Skeleton className="h-6 sm:h-7 w-14 sm:w-16" />
                </div>
              </CardContent>
            </Card>
          ))
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
        <div className="lg:col-span-2 flex flex-col lg:min-h-0">
          <ActiveOrdersCard isLoading={showSkeleton} allActiveOrders={allActiveOrders} />
        </div>

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
            </CardContent>
          </Card>

          <QuickActionsCard isLoading={showSkeleton} recentOrders={recentOrders} />
        </div>
      </div>
    </main>
  );
}

