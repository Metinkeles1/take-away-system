import { AlertTriangle } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import {
  daysOpen,
  agingLevel,
  agingLabel,
  AGING_BADGE_CLASS,
} from "@/lib/orders/aging";
import type { CustomerOpenAccounts } from "@/types";

// Yeni sipariş alınırken müşterinin ödenmemiş siparişleri varsa uyarı gösterir.
// Borç birikmeden önce operatör görür, peşin tahsil etmeyi tercih edebilir.
// Veri panelden `useCustomerOpenAccounts` ile gelir (fiş ile ortak — tek sorgu).
export function CustomerOpenAccountWarning({
  accounts,
}: {
  accounts: CustomerOpenAccounts | null;
}) {
  if (!accounts) return null;

  // En eski borcun yaşına göre uyarı tonu — riskli alacak öne çıksın.
  const oldest = Math.max(...accounts.orders.map((o) => daysOpen(o.createdAt)));
  const level = agingLevel(oldest);
  const isDanger = level === "danger";

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 text-sm",
        isDanger
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Açık hesap: {accounts.count} sipariş · {formatCurrency(accounts.total)}
      </div>
      <ul className="mt-1.5 space-y-1">
        {accounts.orders.map((o) => {
          const d = daysOpen(o.createdAt);
          return (
            <li
              key={o.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="font-medium">#{o.orderNumber}</span>
              <span
                className={cn(
                  "ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                  AGING_BADGE_CLASS[agingLevel(d)],
                )}
              >
                {agingLabel(d)}
              </span>
              <span className="w-16 text-right font-semibold tabular-nums">
                {formatCurrency(o.total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
