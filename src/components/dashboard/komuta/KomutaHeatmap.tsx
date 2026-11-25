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
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function KomutaHeatmap({ hourly, isLoading }: Props) {
  const hasOwn = hourly.some((h) => h.own > 0);
  const hasTy = hourly.some((h) => h.trendyol > 0);
  const maxOwn = Math.max(1, ...hourly.map((h) => h.own));
  const maxTy = Math.max(1, ...hourly.map((h) => h.trendyol));
  const cols = hourly.length;
  const empty = !hasOwn && !hasTy;

  // En yoğun saat (iki kanal toplamı) — dokunmatikte title görünmediği için özet satırı.
  const peak = hourly.reduce<KomutaHourRow | null>(
    (best, h) => (!best || h.own + h.trendyol > best.own + best.trendyol ? h : best),
    null,
  );
  const peakTotal = peak ? peak.own + peak.trendyol : 0;
  const total = hourly.reduce((s, h) => s + h.own + h.trendyol, 0);
  // Dar ekranda her saati yazmak üst üste biner → 3 saatte bir etiket.
  const step = cols > 12 ? 3 : cols > 8 ? 2 : 1;

  // Düz render fonksiyonu (bileşen DEĞİL) — render içinde bileşen tanımlamak
  // "Cannot create components during render" hatası + gereksiz remount demek.
  const renderStrip = ({
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
      <span className={cn("w-12 shrink-0 truncate text-[11px] font-medium sm:w-16 sm:text-xs", color)}>
        {label}
      </span>
      <div
        className="grid flex-1 gap-px sm:gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
      >
        {hourly.map((h) => {
          const v = pick(h);
          const intensity = v === 0 ? 0.06 : 0.18 + (v / max) * 0.8;
          return (
            <div
              key={h.hour}
              className="h-6 rounded-sm sm:h-7 sm:rounded"
              style={{ background: `rgba(${rgb},${intensity})` }}
              title={`${hh(h.hour)} · ${v} sipariş`}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <CardTitle className="text-base">
            Saat Bazlı Yoğunluk{" "}
            <span className="text-[11px] font-normal text-muted-foreground">· kanal ayrımlı</span>
          </CardTitle>
          {!isLoading && !empty && (
            <div className="flex gap-3 text-[11px]">
              {hasOwn && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-blue-500" /> Kendi
                </span>
              )}
              {hasTy && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-orange-500" /> Trendyol
                </span>
              )}
            </div>
          )}
        </div>
        {!isLoading && !empty && peak && peakTotal > 0 && (
          <p className="text-xs text-muted-foreground">
            En yoğun saat{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {hh(peak.hour)}–{hh((peak.hour + 1) % 24)}
            </span>{" "}
            · {peakTotal} sipariş
            {total > 0 && ` (%${Math.round((peakTotal / total) * 100)})`}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : cols === 0 || empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Bu dönemde sipariş yok.</p>
        ) : (
          <div className="space-y-2">
            {hasOwn &&
              renderStrip({
                label: "Kendi",
                color: "text-blue-600 dark:text-blue-400",
                pick: (h) => h.own,
                max: maxOwn,
                rgb: "37,99,235",
              })}
            {hasTy &&
              renderStrip({
                label: "Trendyol",
                color: "text-orange-600 dark:text-orange-400",
                pick: (h) => h.trendyol,
                max: maxTy,
                rgb: "249,115,22",
              })}
            {/* Saat ekseni — mobilde seyreltilir */}
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 sm:w-16" />
              <div
                className="grid flex-1 gap-px text-center text-[9px] tabular-nums text-muted-foreground sm:gap-1"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
              >
                {hourly.map((h, i) => (
                  <span key={h.hour} className={cn(i % step !== 0 && "max-md:invisible")}>
                    {h.hour}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
