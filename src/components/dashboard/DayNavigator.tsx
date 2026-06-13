"use client";

import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isoPlusDays } from "@/lib/datetime";

interface Props {
  offset: number;
  /** Seçili günün ISO'su; veri gelene kadar null olabilir. */
  dateISO: string | null;
  onOffsetChange: (next: number) => void;
  isRefreshing?: boolean;
  disabled?: boolean;
}

export function DayNavigator({
  offset,
  dateISO,
  onOffsetChange,
  isRefreshing,
  disabled,
}: Props) {
  // input[type=date] üst sınırı: bugünden ileri seçilemesin.
  const todayISO = dateISO ? isoPlusDays(dateISO, offset) : "";

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Önceki gün"
        disabled={disabled}
        onClick={() => onOffsetChange(Math.min(offset + 1, 365))}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <input
        type="date"
        value={dateISO ?? ""}
        max={todayISO || undefined}
        disabled={disabled}
        onChange={(e) => {
          if (!dateISO || !e.target.value) return;
          const diff = Math.round(
            (new Date(`${dateISO}T00:00:00Z`).getTime() -
              new Date(`${e.target.value}T00:00:00Z`).getTime()) /
              86_400_000,
          );
          onOffsetChange(Math.max(0, Math.min(offset + diff, 365)));
        }}
        className="h-7 rounded-md px-2 text-sm tabular-nums outline-none"
      />

      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Sonraki gün"
        disabled={disabled || offset === 0}
        onClick={() => onOffsetChange(Math.max(offset - 1, 0))}
      >
        <ChevronRight className="size-4" />
      </Button>

      {offset !== 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={disabled}
          onClick={() => onOffsetChange(0)}
        >
          Bugün
        </Button>
      )}

      {isRefreshing && (
        <RefreshCw className="mr-1 size-3.5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
