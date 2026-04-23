import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, ShoppingBag } from "lucide-react";
import { type DashboardStats } from "@/actions/dashboard";
import { formatCurrency } from "@/lib/utils";
import { CATEGORY_COLORS } from "@/app/dashboard/constants/dashboardConfig";
import { EmptyState } from "../EmptyState";

interface AddressesTabProps {
  stats: DashboardStats | null;
  isLoading: boolean;
}

export const AddressesTab = memo(function AddressesTab({
  stats,
  isLoading,
}: AddressesTabProps) {
  const addrMax = stats?.topAddresses?.[0]?.orderCount ?? 1;
  const menuMax = stats?.menuPreferences?.[0]?.quantity ?? 1;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* Adresler */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-rose-100 flex items-center justify-center">
              <MapPin className="h-4 w-4 text-rose-600" />
            </div>
            En Çok Sipariş Veren Adresler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : (stats?.topAddresses?.length ?? 0) === 0 ? (
            <EmptyState icon={MapPin} text="Henüz veri yok" />
          ) : (
            stats?.topAddresses.map((addr, i) => {
              const pct = (addr.orderCount / addrMax) * 100;
              return (
                <div key={i} className="rounded-xl p-4 border transition-colors hover:bg-rose-50/30 hover:border-rose-200">
                  <div className="flex items-start gap-3">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold shrink-0 ${
                      i < 3 ? "bg-linear-to-br from-rose-400 to-pink-500 text-white shadow-sm" : "bg-gray-100 text-gray-500"
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 leading-snug" title={addr.address}>{addr.address}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-gray-500 flex items-center gap-1.5 font-medium">
                          <ShoppingBag className="h-3.5 w-3.5" /> {addr.orderCount} sipariş
                        </span>
                        <span className="text-xs font-bold text-rose-600">{formatCurrency(addr.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2.5">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-rose-400 to-pink-400 transition-all duration-700"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Menüler */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <Star className="h-4 w-4 text-amber-600" />
            </div>
            En Çok Tercih Edilen Menüler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : (stats?.menuPreferences?.length ?? 0) === 0 ? (
            <EmptyState icon={Star} text="Henüz veri yok" />
          ) : (
            stats?.menuPreferences.map((item, i) => {
              const pct = (item.quantity / menuMax) * 100;
              const catColor = CATEGORY_COLORS[item.category];
              return (
                <div key={item.name} className="rounded-xl p-4 border transition-colors hover:bg-amber-50/30 hover:border-amber-200">
                  <div className="flex items-start gap-3">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold shrink-0 ${
                      i < 3 ? "bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-sm" : "bg-gray-100 text-gray-500"
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                        <Badge variant="outline" className={`text-[10px] font-medium ${catColor?.text ?? "text-gray-600"} ${catColor?.bg ?? "bg-gray-50"} border-0`}>
                          {item.categoryLabel}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="text-xs text-gray-500 font-medium">{item.orderCount} sipariş</span>
                        <span className="text-xs text-gray-500 font-medium">{item.quantity} adet</span>
                        <span className="text-xs font-bold text-amber-600">{formatCurrency(item.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2.5">
                        <div
                          className={`h-full rounded-full bg-linear-to-r ${catColor?.from ?? "from-gray-400"} ${catColor?.to ?? "to-gray-500"} transition-all duration-700`}
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
});
