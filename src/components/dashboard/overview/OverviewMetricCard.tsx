"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  icon: React.ElementType;
  /** Yüzde değişim; null ise kıyas gösterilmez. */
  delta: number | null;
  /** "düne göre" / "geçen haftaya göre" / "geçen aya göre" */
  comparisonLabel: string;
  /** Net gibi vurgulu kartlar için yeşil ton. */
  accent?: boolean;
  isLoading?: boolean;
  /** Verilirse kart tıklanabilir olur (sipariş listesi açar). */
  onClick?: () => void;
}

// Tek bakışta okunan büyük metrik. Renk minimal: vurgulu kart yeşil, kıyas
// oku yeşil/kırmızı. Geri kalan nötr.
export function OverviewMetricCard({
  label,
  value,
  icon: Icon,
  delta,
  comparisonLabel,
  accent,
  isLoading,
  onClick,
}: Props) {
  const up = delta !== null && delta >= 0;
  const clickable = !!onClick && !isLoading;

  return (
    <Card
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
        accent && "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20",
        clickable &&
          "cursor-pointer transition-colors hover:border-foreground/20 hover:bg-muted/40",
      )}
    >
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon
            className={cn(
              "size-4",
              accent && "text-emerald-600 dark:text-emerald-400",
            )}
          />
          {label}
        </div>

        {isLoading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <p
            className={cn(
              "text-3xl font-bold tracking-tight tabular-nums",
              accent && "text-emerald-700 dark:text-emerald-300",
            )}
          >
            {value}
          </p>
        )}

        {!isLoading && (
          <div className="mt-2 flex items-center gap-1.5 text-sm">
            {delta === null ? (
              <span className="text-muted-foreground">{comparisonLabel}</span>
            ) : (
              <>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                    up
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
                  )}
                >
                  {up ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : (
                    <ArrowDownRight className="size-3.5" />
                  )}
                  {up ? "+" : "−"}
                  {Math.abs(delta).toFixed(0)}%
                </span>
                <span className="text-muted-foreground">{comparisonLabel}</span>
              </>
            )}
          </div>
        )}

        {clickable && (
          <p className="mt-2 text-xs font-medium text-muted-foreground">
            Siparişleri gör →
          </p>
        )}
      </CardContent>
    </Card>
  );
}
