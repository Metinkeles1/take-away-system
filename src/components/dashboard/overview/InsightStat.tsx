"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "emerald" | "amber" | "rose";
  /** İyi/kötü yön; +/− rozet. trendUpGood=false → artış kötü (ör. iptal). */
  trend?: number | null;
  trendUpGood?: boolean;
  isLoading?: boolean;
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-foreground",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
};

export function InsightStat({
  label,
  value,
  sub,
  tone = "default",
  trend,
  trendUpGood = true,
  isLoading,
}: Props) {
  const up = trend != null && trend >= 0;
  const good = trend == null ? false : up === trendUpGood;

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="mt-1.5 h-7 w-20" />
        ) : (
          <p className={cn("mt-1 text-2xl font-bold tabular-nums", TONE[tone])}>
            {value}
          </p>
        )}
        {!isLoading && (sub || trend != null) && (
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            {trend != null && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-semibold tabular-nums",
                  good
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
                )}
              >
                {up ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {Math.abs(trend).toFixed(0)}%
              </span>
            )}
            {sub && <span className="text-muted-foreground">{sub}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
