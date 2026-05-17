"use client";

import { Circle, Download, RefreshCw, Search, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PeriodOption<T extends string = string> {
  key: T;
  label: string;
}

interface PageShellProps<T extends string = string> {
  breadcrumb: string[];                     // ["Trendyol", "Overview"]
  periods?: PeriodOption<T>[];
  activePeriod?: T;
  onPeriodChange?: (key: T) => void;
  liveLabel?: string;                       // "Canlı · 12 sn önce"
  onRefresh?: () => void;
  onExport?: () => void;
  isLoading?: boolean;
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell<T extends string = string>({
  breadcrumb,
  periods,
  activePeriod,
  onPeriodChange,
  liveLabel,
  onRefresh,
  onExport,
  isLoading,
  search,
  rightSlot,
  children,
}: PageShellProps<T>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-6">
          <div className="flex items-center gap-2 text-sm">
            {breadcrumb.map((seg, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground/40">/</span>}
                <span
                  className={cn(
                    i === breadcrumb.length - 1
                      ? "font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {seg}
                </span>
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {search && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder={search.placeholder ?? "Ara…"}
                  className="h-8 w-64 rounded-md border border-border/60 bg-background pl-8 pr-2 text-xs outline-none transition focus:border-foreground/30"
                />
              </div>
            )}
            {rightSlot}
            {onExport && (
              <button
                onClick={onExport}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-xs hover:bg-muted/50"
              >
                <Download className="size-3.5" /> Dışa Aktar
              </button>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                aria-label="Yenile"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-xs hover:bg-muted/50 disabled:opacity-50"
              >
                <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
              </button>
            )}
            <button
              aria-label="Ayarlar"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-xs hover:bg-muted/50"
            >
              <Settings2 className="size-3.5" />
            </button>
          </div>
        </div>

        {(periods?.length || liveLabel) && (
          <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 pb-3">
            {periods && periods.length > 0 && (
              <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5 text-xs">
                {periods.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => onPeriodChange?.(p.key)}
                    className={cn(
                      "rounded-[5px] px-2.5 py-1 transition",
                      p.key === activePeriod
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {liveLabel && (
              <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Circle className="size-1.5 animate-pulse fill-emerald-500 text-emerald-500" />
                {liveLabel}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-6">{children}</div>
    </div>
  );
}
