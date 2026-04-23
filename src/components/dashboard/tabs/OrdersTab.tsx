import { memo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { type Order } from "@/types";
import { type DashboardStats } from "@/actions/dashboard";
import { Flame, ClipboardList, ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { statusConfig } from "@/app/dashboard/constants/dashboardConfig";
import { EmptyState } from "../EmptyState";

interface OrdersTabProps {
  stats: DashboardStats | null;
  isLoading: boolean;
}

export const OrdersTab = memo(function OrdersTab({
  stats,
  isLoading,
}: OrdersTabProps) {
  return (
    <div className="space-y-6">
      {/* Aktif Siparişler */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-orange-100 flex items-center justify-center">
                <Flame className="h-4 w-4 text-orange-600" />
              </div>
              Aktif Siparişler
            </CardTitle>
            <Badge variant="outline" className="text-xs font-bold bg-orange-50 text-orange-700 border-orange-200 px-3 py-1">
              {stats?.activeOrderCount ?? 0} aktif
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : (stats?.activeOrders?.length ?? 0) === 0 ? (
            <EmptyState icon={ClipboardList} text="Tüm siparişler tamamlandı" subtext="Aktif sipariş bulunmuyor" color="emerald" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {stats?.activeOrders.map((order) => {
                const cfg = statusConfig[order.status as Order["status"]];
                const Icon = cfg?.icon ?? ClipboardList;
                return (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="group flex items-center justify-between rounded-xl border p-4 transition-all hover:border-gray-300 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-xl ${cfg?.bg} border flex items-center justify-center shrink-0`}>
                        <Icon className={`h-4.5 w-4.5 ${cfg?.color}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">#{order.orderNumber}</span>
                          <span className="text-sm text-gray-500 truncate">{order.customerName}</span>
                        </div>
                        <span className={`text-xs font-medium ${cfg?.color}`}>{cfg?.label}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(order.total)}</span>
                      <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Son Siparişler */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-slate-600" />
              </div>
              Son Siparişler
            </CardTitle>
            <Link href="/orders">
              <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                Tümünü Gör <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
          ) : (stats?.recentOrders?.length ?? 0) === 0 ? (
            <EmptyState icon={ClipboardList} text="Henüz sipariş yok" />
          ) : (
            stats?.recentOrders.map((order) => {
              const cfg = statusConfig[order.status as Order["status"]];
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="group flex items-center justify-between rounded-xl border p-4 transition-all hover:border-gray-300 hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-gray-900">#{order.orderNumber}</span>
                      <span className="text-gray-500 truncate">{order.customerName}</span>
                    </div>
                    <span className={`text-xs font-medium ${cfg?.color}`}>{cfg?.label}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900 shrink-0">{formatCurrency(order.total)}</span>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
});
