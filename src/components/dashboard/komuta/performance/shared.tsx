"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const fmtInt = (n: number) => Math.round(n).toLocaleString("tr-TR");
export const fmtMin = (n: number) => `${Math.round(n)} dk`;

// KPI kutusu — büyük değer + altta kıyas. `tone` değeri renklendirir.
export function PerfStat({
  label,
  value,
  sub,
  delta,
  icon: Icon,
  tone,
  isLoading,
  onClick,
  action,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  /** Hazır biçimlenmiş kıyas; iyi/kötü rengi `good` ile. */
  delta?: { text: string; good: boolean | null } | null;
  icon: React.ElementType;
  tone?: "bad" | "warn" | "good";
  isLoading: boolean;
  onClick?: () => void;
  action?: React.ReactNode;
}) {
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
        "flex flex-col rounded-xl border bg-card p-4",
        clickable && "cursor-pointer transition-colors hover:border-foreground/20 hover:bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        <div className="flex items-center gap-1">
          {action}
          <Icon className="size-4" />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p
          className={cn(
            "mt-2 text-2xl font-bold tabular-nums",
            tone === "bad" && "text-rose-600 dark:text-rose-400",
            tone === "warn" && "text-amber-600 dark:text-amber-400",
            tone === "good" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {value}
        </p>
      )}
      {!isLoading && (delta || sub) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          {delta && (
            <span
              className={cn(
                "font-medium tabular-nums",
                delta.good === true && "text-emerald-600 dark:text-emerald-400",
                delta.good === false && "text-rose-600 dark:text-rose-400",
              )}
            >
              {delta.text}
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

// Yüzde değişim rozeti (▲ yeşil / ▼ kırmızı / • gri).
export function ChangeChip({ pct, threshold }: { pct: number | null; threshold: number }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = pct >= threshold;
  const down = pct <= -threshold;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        up && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
        down && "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
        !up && !down && "bg-muted text-muted-foreground",
      )}
    >
      {up ? "▲ " : down ? "▼ " : ""}
      {pct > 0 ? "+" : pct < 0 ? "−" : ""}%{Math.abs(pct).toFixed(0)}
    </span>
  );
}

// Mini çizgi grafik — son nokta renkli (düşüş kırmızı, yükseliş yeşil).
export function Sparkline({
  values,
  tone,
  width = 88,
  height = 24,
}: {
  values: number[];
  tone: "down" | "up" | "neutral";
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    2 + (i * (width - 4)) / (values.length - 1),
    height - 3 - ((v - min) / range) * (height - 6),
  ]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const dot =
    tone === "down"
      ? "fill-rose-500"
      : tone === "up"
        ? "fill-emerald-500"
        : "fill-violet-500";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <path d={`${d} L${last[0]} ${height} L2 ${height} Z`} className="fill-violet-500/10" />
      <path d={d} fill="none" className="stroke-violet-500" strokeWidth={1.5} />
      <circle cx={last[0]} cy={last[1]} r={2.6} className={dot} />
    </svg>
  );
}

// Kendi/Trendyol pay çubuğu.
export function ChannelSplitBar({ own, trendyol }: { own: number; trendyol: number }) {
  const total = own + trendyol || 1;
  return (
    <div
      className="flex h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      title={`Kendi ${own} · Trendyol ${trendyol}`}
    >
      <span className="h-full bg-blue-500" style={{ width: `${(own / total) * 100}%` }} />
      <span className="h-full bg-orange-500" style={{ width: `${(trendyol / total) * 100}%` }} />
    </div>
  );
}

export function ChannelLegend() {
  return (
    <div className="flex shrink-0 gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-blue-500" /> Kendi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-orange-500" /> Trendyol
      </span>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
