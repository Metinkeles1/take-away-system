"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { type CourierPerformance, type ProductPerformance } from "@/actions/komutaPerformance";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";
import { cn } from "@/lib/utils";
import { useKomutaFilters } from "../KomutaShell";
import { useKomutaQuery } from "../useKomutaQuery";

// Genel Bakış'taki "Dikkat" şeridi: düşen ürünler + hedefi aşan kuryeler, tek
// satırda. Her madde Performans'ın ilgili görünümünü açar. Dikkat gerektiren bir
// şey yoksa hiç görünmez (ekranı boşuna kalabalıklaştırmaz).
export function KomutaPerformanceAlert({
  period,
  channel,
  dayOffset,
}: {
  period: DashboardPeriod;
  channel: OrderSource | "all";
  dayOffset: number;
}) {
  // Performans sayfasıyla aynı sorgular → oraya geçince veri hazır bekler.
  const { refreshKey } = useKomutaFilters();
  const args = [period, channel, dayOffset];
  const { data: products } = useKomutaQuery<ProductPerformance>("productPerf", args, { refreshKey });
  const { data: couriers } = useKomutaQuery<CourierPerformance>("courierPerf", args, { refreshKey });

  const down = (products?.rows ?? [])
    .filter((r) => r.status === "down")
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
  const avg = couriers?.totals.avg ?? null;
  const target = couriers?.target ?? 0;
  const slowCouriers = (couriers?.rows ?? []).filter((r) => r.avg > target && r.count >= 3);
  const avgOver = avg !== null && avg > target;

  if (down.length === 0 && slowCouriers.length === 0 && !avgOver) return null;

  const items: { key: string; href: string; text: string; badge: string; tone: "rose" | "amber" }[] = [
    ...down.slice(0, 3).map((r) => ({
      key: `u-${r.name}`,
      href: "/komuta/performans",
      text: r.name,
      badge: `−%${Math.abs(r.changePct ?? 0).toFixed(0)}`,
      tone: "rose" as const,
    })),
    ...(avgOver
      ? [{
          key: "avg",
          href: "/komuta/performans?g=kurye",
          text: `Ort. teslim (hedef ${target} dk)`,
          badge: `${Math.round(avg!)} dk`,
          tone: "rose" as const,
        }]
      : []),
    ...slowCouriers.slice(0, 2).map((r) => ({
      key: `k-${r.name}`,
      href: "/komuta/performans?g=kurye",
      text: r.name,
      badge: `${Math.round(r.avg)} dk`,
      tone: "amber" as const,
    })),
  ];
  const more = down.length - 3;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card text-sm shadow-xs sm:flex-row sm:items-stretch">
      <div className="flex items-center gap-2 border-b px-4 py-2.5 font-semibold sm:border-r sm:border-b-0">
        <span className="size-2 rounded-full bg-rose-500" />
        Dikkat
      </div>
      <ul className="flex min-w-0 flex-1 flex-wrap">
        {items.map((it) => (
          <li key={it.key} className="border-b sm:border-r sm:border-b-0">
            <Link
              href={it.href}
              className="flex h-full items-center gap-2 px-4 py-2.5 transition-colors hover:bg-muted/50"
            >
              <span className="truncate">{it.text}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-px text-[11px] font-semibold tabular-nums",
                  it.tone === "rose"
                    ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
                )}
              >
                {it.badge}
              </span>
            </Link>
          </li>
        ))}
        {more > 0 && (
          <li className="flex items-center px-4 py-2.5 text-xs text-muted-foreground">+{more} ürün daha</li>
        )}
      </ul>
      <Link
        href={down.length > 0 ? "/komuta/performans" : "/komuta/performans?g=kurye"}
        className="flex items-center gap-1 px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap text-violet-600 hover:text-violet-700 dark:text-violet-400"
      >
        Performans&apos;ta aç
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
