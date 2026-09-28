"use client";


import {
  type KomutaCustomers,
  type KomutaCustomerRow,
} from "@/actions/komutaOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";
import { formatCurrencyShort } from "@/lib/utils";
import { KomutaRankList, type KomutaRankItem } from "./KomutaRankList";
import { StatStrip, StripStat } from "./KomutaUI";
import { useKomutaFilters } from "./KomutaShell";
import { useKomutaQuery } from "./useKomutaQuery";

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
  const { refreshKey } = useKomutaFilters();
  const { data } = useKomutaQuery<KomutaCustomers>("customers", [period, channel, dayOffset], {
    refreshKey,
  });

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
      <StatStrip className="grid-cols-1 sm:grid-cols-3">
        <StripStat label="Sadece Kendi" value={String(seg?.onlyOwn ?? 0)} sub="yalnız paket/manuel" dot="bg-blue-500" isLoading={data === null} />
        <StripStat label="Sadece Trendyol" value={String(seg?.onlyTrendyol ?? 0)} sub="yalnız Trendyol'dan" dot="bg-orange-500" isLoading={data === null} />
        <StripStat label="Her iki kanal" value={String(seg?.both ?? 0)} sub="hem senden hem Trendyol'dan" dot="bg-violet-500" tone="violet" isLoading={data === null} />
      </StatStrip>

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
