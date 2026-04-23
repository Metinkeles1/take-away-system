import { memo } from "react";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import { PAYMENT_LABELS } from "@/app/dashboard/constants/dashboardConfig";

interface PaymentBreakdownProps {
  data?: Record<string, number>;
  total: number;
  emptyText?: string;
  totalLabel?: string;
  totalColor?: string;
}

export const PaymentBreakdown = memo(function PaymentBreakdown({
  data,
  total,
  emptyText,
  totalLabel = "Toplam",
  totalColor = "text-gray-900",
}: PaymentBreakdownProps) {
  const allZero = data && Object.values(data).every((v) => v === 0);

  return (
    <div className="space-y-4">
      {Object.entries(data ?? {}).map(([method, amount]) => {
        const config = PAYMENT_LABELS[method];
        if (!config) return null;
        const pct = total > 0 ? (amount / total) * 100 : 0;
        const PayIcon = config.icon;
        return (
          <div key={method} className="flex items-center gap-4">
            <div className={`rounded-xl p-2.5 ${config.bg}`}>
              <PayIcon className={`h-4 w-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{config.label}</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(amount)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${config.bg} transition-all duration-700`}
                  style={{ width: `${Math.max(pct, 1)}%`, opacity: 0.8 }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-400 w-12 text-right font-medium">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
      {allZero && emptyText && (
        <p className="text-sm text-gray-400 text-center py-6">{emptyText}</p>
      )}
      <Separator />
      <div className="flex items-center justify-between pt-1">
        <span className="text-sm font-bold text-gray-900">{totalLabel}</span>
        <span className={`text-base font-bold ${totalColor}`}>{formatCurrency(total)}</span>
      </div>
    </div>
  );
});
