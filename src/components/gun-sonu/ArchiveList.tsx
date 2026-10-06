"use client";

import { memo } from "react";
import { Bot, Hand } from "lucide-react";

import type { EndOfDaySnapshotSummary } from "@/actions/endOfDay";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";

import { formatDayTR } from "./meta";

// Kapatılmış (dondurulmuş) günlerin arşivi — satıra tıklayınca o güne gider.
export const ArchiveList = memo(function ArchiveList({
  snapshots,
  activeDate,
  isLoading,
  onSelect,
}: {
  snapshots: EndOfDaySnapshotSummary[];
  activeDate: string;
  isLoading: boolean;
  onSelect: (date: string) => void;
}) {
  return (
    <>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Henüz kapatılmış gün yok. Bir günü kapatınca burada listelenir.
          </p>
        ) : (
          <div className="space-y-1.5">
            {snapshots.map((s) => {
              const isActive = s.date === activeDate;
              const isCron = s.source === "cron";
              return (
                <button
                  key={s.date}
                  type="button"
                  onClick={() => onSelect(s.date)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50",
                    isActive && "border-primary bg-primary/5 ring-1 ring-primary/30",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{formatDayTR(s.date)}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {s.packageCount} paket
                      {s.closedAt &&
                        ` · ${new Date(s.closedAt).toLocaleString("tr-TR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(s.totalRevenue)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      isCron
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-slate-500/15 text-slate-600 dark:text-slate-300",
                    )}
                    title={isCron ? "Otomatik (cron) kapatıldı" : "Elle kapatıldı"}
                  >
                    {isCron ? <Bot className="size-3" /> : <Hand className="size-3" />}
                    {isCron ? "Oto" : "Elle"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
    </>
  );
});
