"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  heatmap: number[][]; // [7 gün][24 saat], Pazartesi=0
  max: number;
  isLoading: boolean;
}

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
// Gece-erken saatler genelde boş; 8–24 arası gösterilir (paket işine uygun).
const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 8…23

// Yoğunluk ısı haritası — hangi gün hangi saat patlıyor. Personel/hazırlık planı.
export function OverviewHeatmap({ heatmap, max, isLoading }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Yoğunluk — Gün × Saat</CardTitle>
        <CardDescription>
          Sipariş sayısı; koyu = yoğun. Personel ve hazırlık planı için.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : max === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Bu dönemde sipariş yok.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              {/* Saat başlıkları */}
              <div className="mb-1 flex pl-9 text-[10px] text-muted-foreground">
                {HOURS.map((h) => (
                  <div key={h} className="flex-1 text-center tabular-nums">
                    {h % 2 === 0 ? h : ""}
                  </div>
                ))}
              </div>
              {DAYS.map((day, dow) => (
                <div key={day} className="mb-1 flex items-center gap-1">
                  <div className="w-8 shrink-0 text-[11px] font-medium text-muted-foreground">
                    {day}
                  </div>
                  <div className="flex flex-1 gap-1">
                    {HOURS.map((h) => {
                      const count = heatmap[dow]?.[h] ?? 0;
                      const intensity = count / max;
                      return (
                        <div
                          key={h}
                          title={`${day} ${h}:00 — ${count} sipariş`}
                          className={cn(
                            "h-6 flex-1 rounded-sm",
                            count === 0 && "bg-muted",
                          )}
                          style={
                            count > 0
                              ? {
                                  backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(
                                    20 + intensity * 80,
                                  )}%, transparent)`,
                                }
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
