import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Crown, UtensilsCrossed } from "lucide-react";
import { type DashboardStats } from "@/actions/dashboard";
import { formatCurrency } from "@/lib/utils";
import { CATEGORY_COLORS } from "@/app/dashboard/constants/dashboardConfig";
import { EmptyState } from "../EmptyState";

interface ProductsTabProps {
  stats: DashboardStats | null;
  isLoading: boolean;
}

export const ProductsTab = memo(function ProductsTab({
  stats,
  isLoading,
}: ProductsTabProps) {
  const topMax = stats?.topProducts?.[0]?.quantity ?? 1;
  const catMax = useMemo(
    () => Math.max(...(stats?.categoryBreakdown?.map((c) => c.revenue) ?? []), 1),
    [stats?.categoryBreakdown],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* En çok satanlar */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <Crown className="h-4 w-4 text-amber-600" />
            </div>
            En Çok Satan Ürünler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : (stats?.topProducts?.length ?? 0) === 0 ? (
            <EmptyState icon={Crown} text="Henüz veri yok" />
          ) : (
            stats?.topProducts.map((product, i) => {
              const pct = (product.quantity / topMax) * 100;
              return (
                <div key={product.name} className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-amber-50/50">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold shrink-0 ${
                    i === 0 ? "bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-sm" :
                    i === 1 ? "bg-linear-to-br from-gray-300 to-gray-400 text-white" :
                    i === 2 ? "bg-linear-to-br from-orange-300 to-amber-400 text-white" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">{product.name}</span>
                      <span className="text-sm font-bold text-gray-900 ml-3 shrink-0">{formatCurrency(product.revenue)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-amber-400 to-orange-400 transition-all duration-700"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 shrink-0 font-medium w-16 text-right">{product.quantity} adet</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Kategori dağılımı */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-rose-100 flex items-center justify-center">
              <UtensilsCrossed className="h-4 w-4 text-rose-600" />
            </div>
            Kategori Dağılımı
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : (stats?.categoryBreakdown?.length ?? 0) === 0 ? (
            <EmptyState icon={UtensilsCrossed} text="Henüz veri yok" />
          ) : (
            stats?.categoryBreakdown.map((cat) => {
              const pct = (cat.revenue / catMax) * 100;
              const catColor = CATEGORY_COLORS[cat.category];
              return (
                <div key={cat.category} className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-gray-50">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${catColor?.bg ?? "bg-gray-100"}`}>
                    <div className={`h-3 w-3 rounded-full bg-linear-to-r ${catColor?.from ?? "from-gray-400"} ${catColor?.to ?? "to-gray-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{cat.label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500 font-medium">{cat.quantity} adet</span>
                        <span className="text-sm font-bold text-gray-900">{formatCurrency(cat.revenue)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-linear-to-r ${catColor?.from ?? "from-gray-400"} ${catColor?.to ?? "to-gray-500"} transition-all duration-700`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
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
