"use client";

import Link from "next/link";

import { type KomutaOrderRow } from "@/actions/komutaOverview";
import { cn, formatCurrencyShort } from "@/lib/utils";

interface Props {
  row: KomutaOrderRow;
  /** Çok günlü dönem → saatin üstünde gün de gösterilir. */
  showDate: boolean;
  /** "card": kenarlıklı kompakt satır · "line": liste satırı (ödeme/bölge + hakediş). */
  variant: "card" | "line";
  onTrendyolClick: (orderNumber: string) => void;
}

// Komuta sipariş listelerinin ortak satırı. Kendi sipariş → sipariş sayfasına
// link; Trendyol → arşiv detay paneli (onTrendyolClick).
export function KomutaOrderRowItem({ row: r, showDate, variant, onTrendyolClick }: Props) {
  const isTy = r.channel === "trendyol";
  const inner = (
    <>
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums text-muted-foreground",
          variant === "line" ? "w-11" : "w-9",
          showDate && "leading-tight",
        )}
      >
        {showDate && <span className="block text-[10px]">{r.dateLabel}</span>}
        {r.time}
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
          isTy
            ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
            : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
        )}
      >
        {isTy ? "TY" : "Kendi"}
      </span>
      {variant === "line" ? (
        <>
          <span className="w-12 shrink-0 truncate text-sm font-semibold tabular-nums">
            #{r.orderNumber}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.customerName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.paymentLabel}
              {r.district ? ` · ${r.district}` : ""}
            </p>
          </div>
          <div className="w-24 shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums">{formatCurrencyShort(r.total)}</p>
            {r.net > 0 && (
              <p className="text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                net {r.netEstimated ? "~" : ""}
                {formatCurrencyShort(r.net)}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <span className="shrink-0 text-sm font-semibold">#{r.orderNumber}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {r.customerName}
            {r.district ? ` · ${r.district}` : ""}
          </span>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {formatCurrencyShort(r.total)}
          </span>
        </>
      )}
    </>
  );

  const cls =
    variant === "line"
      ? "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
      : "flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent";

  if (r.id) {
    return (
      <Link href={`/orders/${r.id}`} className={cls}>
        {inner}
      </Link>
    );
  }
  if (isTy) {
    return (
      <button type="button" className={cls} onClick={() => onTrendyolClick(r.orderNumber)}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
