"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KomutaOrderRowItem } from "./KomutaOrderRowItem";
import { TrendyolOrderSheet } from "./TrendyolOrderSheet";
import { type KomutaOrderRow } from "@/actions/komutaOverview";
import { useKomutaFilters } from "./KomutaShell";
import { useKomutaQuery } from "./useKomutaQuery";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";

interface Props {
  period: DashboardPeriod;
  channel: OrderSource | "all";
  dayOffset: number;
}

// Son siparişler — Kendi (DB) + Trendyol (API) birleşik, en yeniler üstte.
export function KomutaRecentOrders({ period, channel, dayOffset }: Props) {
  const { refreshKey } = useKomutaFilters();
  const { data } = useKomutaQuery<KomutaOrderRow[]>("periodOrders", [period, channel, dayOffset], {
    refreshKey,
  });
  const rows = data
    ? data.filter((o) => !o.status.toLowerCase().includes("cancel")).slice(0, 8)
    : null;
  const [tyOrder, setTyOrder] = useState<string | null>(null);

  return (
    <Card className="flex h-full flex-col">
      <TrendyolOrderSheet orderNumber={tyOrder} onClose={() => setTyOrder(null)} />
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
            {rows.map((o, i) => (
              <li key={o.id ?? `ty-${o.orderNumber}-${i}`}>
                <KomutaOrderRowItem
                  row={o}
                  variant="card"
                  showDate={period !== "day"}
                  onTrendyolClick={setTyOrder}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
