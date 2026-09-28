"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  delta: number | null;
  comparisonLabel: string;
  accent?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
  /** Alt kısım — kanal oranı çubuğu, iptal satırı vb. */
  footer?: React.ReactNode;
}

// Komuta KPI hücresi — StatStrip içinde yan yana durur: etiket, büyük değer,
// sade delta (▲/▼ %), altta kanal oranı. Net hücresi yeşil üst çizgiyle ayrışır.
export function KomutaMetricCard({
  label,
  value,
  delta,
  comparisonLabel,
  accent,
  isLoading,
  onClick,
  footer,
}: Props) {
  // Yuvarlanınca %0 olan fark yön göstermez (kırmızı "▼ %0" yanıltıcı).
  const flat = delta !== null && Math.abs(delta) < 0.5;
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
        "flex min-w-0 flex-col gap-1.5 bg-card p-4",
        accent && "bg-emerald-50/60 shadow-[inset_0_3px_0_var(--color-emerald-500)] dark:bg-emerald-950/20",
        clickable && "cursor-pointer transition-colors hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "text-xs",
          accent ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
        )}
      >
        {label}
      </span>

      {isLoading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <span
          className={cn(
            "text-[26px] font-bold leading-tight tracking-tight tabular-nums",
            accent && "text-emerald-700 dark:text-emerald-300",
          )}
        >
          {value}
        </span>
      )}

      {!isLoading && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {flat && <span className="font-semibold tabular-nums">± %0</span>}
          {delta !== null && !flat && (
            <span
              className={cn(
                "font-semibold tabular-nums",
                up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
              )}
            >
              {up ? "▲" : "▼"} %{Math.abs(delta).toFixed(0)}
            </span>
          )}
          {comparisonLabel}
        </span>
      )}

      {!isLoading && footer && <div className="mt-1.5 flex flex-col gap-1.5">{footer}</div>}
    </div>
  );
}
