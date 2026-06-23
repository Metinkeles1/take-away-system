"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  icon: React.ElementType;
  delta: number | null;
  comparisonLabel: string;
  accent?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
  /** Alt satırdaki kanal kırılımı çipleri. */
  chips?: React.ReactNode;
}

// Komuta Merkezi KPI kartı — mockup tasarımı: üstte etiket + ikon, büyük değer,
// sade delta (▲/▼ %), altta kanal çipleri.
export function KomutaMetricCard({
  label,
  value,
  icon: Icon,
  delta,
  comparisonLabel,
  accent,
  isLoading,
  onClick,
  chips,
}: Props) {
  const up = delta !== null && delta >= 0;
  const clickable = !!onClick && !isLoading;

  return (
    <div
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "rounded-xl border bg-card p-4",
        accent &&
          "border-2 border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20",
        clickable && "cursor-pointer transition-colors hover:border-foreground/20 hover:bg-muted/30",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between text-sm",
          accent ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
        )}
      >
        <span>{label}</span>
        <Icon className="size-4" />
      </div>

      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p
          className={cn(
            "mt-2 text-2xl font-bold tabular-nums",
            accent && "text-emerald-700 dark:text-emerald-300",
          )}
        >
          {value}
        </p>
      )}

      {!isLoading && (
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          {delta === null ? (
            <span className="text-muted-foreground">{comparisonLabel}</span>
          ) : (
            <>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  up
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
                )}
              >
                {up ? "▲" : "▼"} %{Math.abs(delta).toFixed(0)}
              </span>
              <span className="text-muted-foreground">{comparisonLabel}</span>
            </>
          )}
        </div>
      )}

      {!isLoading && chips && <div className="mt-3">{chips}</div>}
    </div>
  );
}
