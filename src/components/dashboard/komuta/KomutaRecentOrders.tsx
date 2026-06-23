"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrencyShort } from "@/lib/utils";
import {
  getKomutaPeriodOrders,
  type KomutaOrderRow,
} from "@/actions/komutaOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";

interface Props {
  period: DashboardPeriod;
  channel: OrderSource | "all";
  dayOffset: number;
}

// Son siparişler — Kendi (DB) + Trendyol (API) birleşik, en yeniler üstte.
export function KomutaRecentOrders({ period, channel, dayOffset }: Props) {
  const [rows, setRows] = useState<KomutaOrderRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    getKomutaPeriodOrders(period, channel, dayOffset).then((r) => {
      if (alive) setRows(r.filter((o) => !o.status.toLowerCase().includes("cancel")).slice(0, 8));
    });
    return () => {
      alive = false;
    };
  }, [period, channel, dayOffset]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Son Siparişler</CardTitle>
        <Link
          href="/orders"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Tümü →
        </Link>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {rows === null ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <CheckCircle2 className="mb-2 size-10 opacity-30" />
            <p className="text-sm">Bu dönemde sipariş yok</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((o, i) => {
              const inner = (
                <>
                  <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {o.time}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                      o.channel === "trendyol"
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                    )}
                  >
                    {o.channel === "trendyol" ? "TY" : "Kendi"}
                  </span>
                  <span className="shrink-0 text-sm font-semibold">#{o.orderNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {o.customerName}
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatCurrencyShort(o.total)}
                  </span>
                </>
              );
              return (
                <li key={o.id ?? `ty-${i}`}>
                  {o.id ? (
                    <Link
                      href={`/orders/${o.id}`}
                      className="flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-accent"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-lg border p-2.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
