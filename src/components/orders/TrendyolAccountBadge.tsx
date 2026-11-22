import { cn } from "@/lib/utils";
import { ACCOUNT_BADGE_CLASS, accountColor } from "@/lib/integrations/trendyol/accountColors";
import type { TrendyolAccountLabel } from "@/types";

// Trendyol siparişinin hangi işletmeye ait olduğunu gösteren küçük renkli etiket.
// Yalnız 2+ Trendyol hesabı varken veri gelir; yoksa hiçbir şey çizmez.
export function TrendyolAccountBadge({
  account,
  className,
}: {
  account?: TrendyolAccountLabel | null;
  className?: string;
}) {
  if (!account) return null;
  return (
    <span
      title={`Trendyol · ${account.name}`}
      className={cn(
        "inline-block max-w-28 shrink-0 truncate rounded px-1.5 text-xs font-semibold leading-5",
        ACCOUNT_BADGE_CLASS[accountColor(account.color)],
        className,
      )}
    >
      {account.name}
    </span>
  );
}
