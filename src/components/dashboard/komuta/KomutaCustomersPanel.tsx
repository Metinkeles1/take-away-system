"use client";

import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";

import {
  getKomutaCustomers,
  type KomutaCustomers,
  type KomutaCustomerRow,
} from "@/actions/komutaOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";
import { formatCurrencyShort } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KomutaRankList, type KomutaRankItem } from "./KomutaRankList";

interface Props {
  period: DashboardPeriod;
  channel: OrderSource | "all";
  dayOffset: number;
  showLegend: boolean;
  onCustomerClick: (c: KomutaCustomerRow) => void;
  /** Segmentlerle en değerli müşteriler arasına eklenen kohort kartları. */
  cohorts?: React.ReactNode;
}

// Müşteri: kanal segmentleri + (kohortlar) + en değerli müşteriler (iki renkli,
// tıklanır). Kendi (DB) + Trendyol (API) telefonla eşleştirilir.
export function KomutaCustomersPanel({
  period,
  channel,
  dayOffset,
  showLegend,
  onCustomerClick,
  cohorts,
}: Props) {
  const [data, setData] = useState<KomutaCustomers | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    getKomutaCustomers(period, channel, dayOffset).then((r) => {
      if (alive) setData(r);
    });
    return () => {
      alive = false;
    };
  }, [period, channel, dayOffset]);

  const seg = data?.segments;
  const customers = data?.topCustomers ?? [];
  const rowId = (c: KomutaCustomerRow) => c.phone ?? c.trendyolId ?? c.name;
  const maxTotal = Math.max(1, ...customers.map((c) => c.total));
  const items: KomutaRankItem[] = customers.map((c) => ({
    id: rowId(c),
    label: c.name && c.name !== "—" ? c.name : c.phone ?? "Trendyol müşterisi",
    primary: `${formatCurrencyShort(c.total)} · ${c.own.orders + c.trendyol.orders} sip`,
    ownShare: (c.own.revenue / maxTotal) * 100,
    tyShare: (c.trendyol.revenue / maxTotal) * 100,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* Kanal segmentleri */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SegmentCard
          label="Sadece Kendi"
          value={seg?.onlyOwn}
          sub="yalnız paket/manuel"
          dot="bg-blue-500"
          isLoading={data === null}
        />
        <SegmentCard
          label="Sadece Trendyol"
          value={seg?.onlyTrendyol}
          sub="yalnız Trendyol'dan"
          dot="bg-orange-500"
          isLoading={data === null}
        />
        <Card className="border-2 border-violet-200 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-violet-700 dark:text-violet-300">
              <span className="text-sm font-medium">Her İki Kanal</span>
              <Repeat className="size-4" />
            </div>
            {data === null ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-bold tabular-nums text-violet-700 dark:text-violet-300">
                {seg?.both ?? 0}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">hem senden hem Trendyol&apos;dan</p>
          </CardContent>
        </Card>
      </div>

      {cohorts}

      <KomutaRankList
        title="En Değerli Müşteriler"
        items={items}
        isLoading={data === null}
        emptyText="Bu dönemde müşteri verisi yok."
        hint="Satıra tıkla → kendi/Trendyol kırılımı + sipariş geçmişi"
        showLegend={showLegend}
        onItemClick={(id) => {
          const c = customers.find((x) => rowId(x) === id);
          if (c) onCustomerClick(c);
        }}
      />
    </div>
  );
}

function SegmentCard({
  label,
  value,
  sub,
  dot,
  isLoading,
}: {
  label: string;
  value: number | undefined;
  sub: string;
  dot: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-sm">{label}</span>
          <span className={`size-2.5 rounded-sm ${dot}`} />
        </div>
        {isLoading ? (
          <Skeleton className="mt-2 h-8 w-16" />
        ) : (
          <p className="mt-1 text-2xl font-bold tabular-nums">{value ?? 0}</p>
        )}
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
