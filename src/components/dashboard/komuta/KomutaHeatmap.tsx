"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { KomutaHourRow } from "@/actions/komutaOverview";

interface Props {
  hourly: KomutaHourRow[];
  isLoading?: boolean;
}

// Saat bazlı yoğunluk — mock tasarımı: iki şerit (Kendi mavi, Trendyol turuncu),
// saat ekseni hizalı. Her şerit kendi maksimumuna göre tonlanır.
export function KomutaHeatmap({ hourly, isLoading }: Props) {
  const hasOwn = hourly.some((h) => h.own > 0);
  const hasTy = hourly.some((h) => h.trendyol > 0);
  const maxOwn = Math.max(1, ...hourly.map((h) => h.own));
  const maxTy = Math.max(1, ...hourly.map((h) => h.trendyol));
  const cols = hourly.length;

  const Strip = ({
    label,
    color,
    pick,
    max,
    rgb,
  }: {
    label: string;
    color: string;
    pick: (h: KomutaHourRow) => number;
    max: number;
    rgb: string;
  }) => (
    <div className="flex items-center gap-2">
      <span className={cn("w-16 shrink-0 text-xs font-medium", color)}>{label}</span>
      <div
        className="grid flex-1 gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
      >
        {hourly.map((h) => {
          const v = pick(h);
          const intensity = v === 0 ? 0.06 : 0.18 + (v / max) * 0.8;
          return (
            <div
              key={h.hour}
              className="h-7 rounded"
              style={{ background: `rgba(${rgb},${intensity})` }}
              title={`${String(h.hour).padStart(2, "0")}:00 · ${v} sipariş`}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Saat Bazlı Yoğunluk{" "}
            <span className="text-[11px] font-normal text-muted-foreground">· kanal ayrımlı</span>
          </CardTitle>
          <div className="flex gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-blue-500" /> Kendi
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-orange-500" /> Trendyol
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : cols === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Bu dönemde sipariş yok.</p>
        ) : (
          <div className="space-y-2">
            {hasOwn && (
              <Strip
                label="Kendi"
                color="text-blue-600 dark:text-blue-400"
                pick={(h) => h.own}
                max={maxOwn}
                rgb="37,99,235"
              />
            )}
            {hasTy && (
              <Strip
                label="Trendyol"
                color="text-orange-600 dark:text-orange-400"
                pick={(h) => h.trendyol}
                max={maxTy}
                rgb="249,115,22"
              />
            )}
            {/* Saat ekseni */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0" />
              <div
                className="grid flex-1 gap-1 text-center text-[9px] text-muted-foreground"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
              >
                {hourly.map((h) => (
                  <span key={h.hour}>{h.hour}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
