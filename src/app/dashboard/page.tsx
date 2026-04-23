"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { getDashboardStats, type DashboardStats } from "@/actions/dashboard";
import { ShoppingBag, CircleDollarSign, Flame, TrendingUp, Users, UtensilsCrossed, Package } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { KPICard, KPICardSkeleton } from "@/components/dashboard/KPICard";
import { MiniStat } from "@/components/dashboard/MiniStat";
import { OverviewTab } from "@/components/dashboard/tabs/OverviewTab";
import { OrdersTab } from "@/components/dashboard/tabs/OrdersTab";
import { PaymentsTab } from "@/components/dashboard/tabs/PaymentsTab";
import { ProductsTab } from "@/components/dashboard/tabs/ProductsTab";
import { AddressesTab } from "@/components/dashboard/tabs/AddressesTab";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
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
    <div className="h-full flex flex-col overflow-hidden">
      <DashboardHeader isLoading={isLoading} onRefresh={loadStats} />

      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50/60">
        <div className="px-8 py-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {isLoading ? (
              [...Array(4)].map((_, i) => <KPICardSkeleton key={i} />)
            ) : (
              <>
                <KPICard
                  label="Bugünkü Sipariş"
                  value={String(stats?.todayOrderCount ?? 0)}
                  icon={ShoppingBag}
                  color="blue"
                  trend={todayTrend}
                  trendLabel="dünkü ciroya göre"
                />
                <KPICard
                  label="Bugünkü Ciro"
                  value={formatCurrency(stats?.todayRevenue ?? 0)}
                  icon={CircleDollarSign}
                  color="emerald"
                />
                <KPICard
                  label="Aktif Sipariş"
                  value={String(stats?.activeOrderCount ?? 0)}
                  icon={Flame}
                  color="amber"
                />
                <KPICard
                  label="Toplam Ciro"
                  value={formatCurrency(stats?.totalRevenue ?? 0)}
                  icon={TrendingUp}
                  color="violet"
                />
              </>
            )}
          </div>

          {/* Mini Stats */}
          <div className="grid grid-cols-3 gap-5">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-gray-200" />
                  <div className="space-y-1.5">
                    <div className="h-3 w-20 bg-gray-200 rounded" />
                    <div className="h-6 w-12 bg-gray-200 rounded" />
                  </div>
                </div>
              ))
            ) : (
              <>
                <MiniStat icon={Package} label="Toplam Sipariş" value={String(stats?.totalOrderCount ?? 0)} color="indigo" />
                <MiniStat icon={Users} label="Toplam Müşteri" value={String(stats?.totalCustomerCount ?? 0)} color="pink" />
                <MiniStat icon={UtensilsCrossed} label="Toplam Ürün" value={String(stats?.totalProductCount ?? 0)} color="amber" />
              </>
            )}
          </div>

          {/* Tabs */}
          {activeTab === "overview" && <OverviewTab stats={stats} isLoading={isLoading} />}
          {activeTab === "orders" && <OrdersTab stats={stats} isLoading={isLoading} />}
          {activeTab === "payments" && <PaymentsTab stats={stats} isLoading={isLoading} />}
          {activeTab === "products" && <ProductsTab stats={stats} isLoading={isLoading} />}
          {activeTab === "addresses" && <AddressesTab stats={stats} isLoading={isLoading} />}
        </div>
      </div>
    </div>
  );
}

// Helper
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(amount);
}
