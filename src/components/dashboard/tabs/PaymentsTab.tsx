import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleDollarSign, TrendingUp } from "lucide-react";
import { type DashboardStats } from "@/actions/dashboard";
import { PaymentBreakdown } from "../PaymentBreakdown";

interface PaymentsTabProps {
  stats: DashboardStats | null;
  isLoading: boolean;
}

export const PaymentsTab = memo(function PaymentsTab({
  stats,
  isLoading,
}: PaymentsTabProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CircleDollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            Bugünkü Ödeme Dağılımı
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
          ) : (
            <PaymentBreakdown data={stats?.paymentBreakdown} total={stats?.todayRevenue ?? 0} emptyText="Bugün henüz sipariş yok" totalLabel="Bugün Toplam" totalColor="text-emerald-600" />
          )}
        </CardContent>
      </Card>

      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-violet-600" />
            </div>
            Toplam Ödeme Dağılımı
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
          ) : (
            <PaymentBreakdown data={stats?.paymentBreakdownAll} total={stats?.totalRevenue ?? 0} totalLabel="Genel Toplam" totalColor="text-violet-600" />
          )}
        </CardContent>
      </Card>
    </div>
  );
});
