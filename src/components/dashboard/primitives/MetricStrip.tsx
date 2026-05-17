"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Delta } from "./Delta";
import { fmtValue, type MetricFormat } from "./formatters";

export interface MetricStripItem {
  key: string;
  label: string;
  value: number;
  format?: MetricFormat;
  delta?: number | null;            // yüzde
  positiveIsGood?: boolean;          // iade/iptal için false
  spark?: { x: number; y: number }[]; // opsiyonel sparkline
  onClick?: () => void;
}

interface MetricStripProps {
  items: MetricStripItem[];
  isLoading?: boolean;
  // 1..6 column count; default md:3 lg:6
  columnsClassName?: string;
  className?: string;
}

export function MetricStrip({
  items,
  isLoading,
  columnsClassName = "md:grid-cols-3 lg:grid-cols-6",
  className,
}: MetricStripProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          "grid grid-cols-2 divide-y divide-border/60 rounded-lg border border-border/60 md:divide-y-0 md:divide-x",
          columnsClassName,
          className,
        )}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 px-4 py-3">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            <div className="h-7 w-full animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 divide-y divide-border/60 rounded-lg border border-border/60 md:divide-y-0 md:divide-x",
        columnsClassName,
        className,
      )}
    >
      {items.map((m) => {
        const Wrapper = m.onClick ? "button" : "div";
        return (
          <Wrapper
            key={m.key}
            onClick={m.onClick}
            className={cn(
              "group flex flex-col items-start gap-2 px-4 py-3 text-left transition",
              m.onClick && "hover:bg-muted/30",
            )}
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {m.label}
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-[19px] font-semibold tabular-nums tracking-tight">
                {fmtValue(m.value, m.format ?? "int")}
              </div>
              {m.delta !== undefined && (
                <Delta value={m.delta} positiveIsGood={m.positiveIsGood} />
              )}
            </div>
            <div className="h-7 w-full">
              {m.spark && m.spark.length > 1 ? (
                <ResponsiveContainer>
                  <LineChart data={m.spark}>
                    <Line
                      dataKey="y"
                      stroke="currentColor"
                      strokeWidth={1.25}
                      dot={false}
                      className="text-foreground/40 group-hover:text-foreground"
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
}
