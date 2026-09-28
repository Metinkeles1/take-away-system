"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Komuta Merkezi'nin ortak küçük parçaları: düğme grubu (segmented) ve sayı
// şeridi. Filtreler, alt görünümler ve KPI'lar hep aynı dili konuşsun diye.

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; dot?: string; icon?: React.ElementType }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex h-8 gap-0.5 rounded-lg border bg-muted/60 p-0.75", className)}
    >
      {options.map((o) => {
        const active = o.id === value;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              active
                ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.dot && <span className={cn("size-1.75 rounded-full", o.dot)} />}
            {Icon && <Icon className="size-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Tek yüzeyde, ince çizgilerle bölünmüş sayı şeridi. Hücreler (PerfStat,
// KomutaMetricCard, StripStat) kendi çerçevesini bırakıp şeride uyar.
export function StatStrip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border bg-border shadow-xs",
        "*:rounded-none *:border-0 *:shadow-none",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function StripStat({
  label,
  value,
  sub,
  tone,
  dot,
  isLoading,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn" | "violet";
  dot?: string;
  isLoading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        {dot && <span className={cn("size-2 rounded-full", dot)} />}
      </span>
      {isLoading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <span
          className={cn(
            "text-2xl font-bold tabular-nums tracking-tight",
            tone === "good" && "text-emerald-600 dark:text-emerald-400",
            tone === "bad" && "text-rose-600 dark:text-rose-400",
            tone === "warn" && "text-amber-600 dark:text-amber-400",
            tone === "violet" && "text-violet-700 dark:text-violet-300",
          )}
        >
          {value}
        </span>
      )}
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

// Kendi/Trendyol oranı — ince iki renkli çubuk + altında iki değer.
export function ChannelSplitBar({ own, trendyol, format }: { own: number; trendyol: number; format: (n: number) => string }) {
  const total = own + trendyol;
  if (total <= 0) return null;
  const ownPct = (own / total) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-1.25 overflow-hidden rounded-full bg-muted">
        <div className="bg-blue-500" style={{ width: `${ownPct}%` }} />
        <div className="bg-orange-500" style={{ width: `${100 - ownPct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-blue-500" />
          {format(own)}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-orange-500" />
          {format(trendyol)}
        </span>
      </div>
    </div>
  );
}
