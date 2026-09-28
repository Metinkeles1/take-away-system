"use client";

import { useState } from "react";

import { type KomutaCustomerRow } from "@/actions/komutaOverview";
import { type DashboardInsights } from "@/actions/dashboardInsights";
import { formatCurrencyShort } from "@/lib/utils";
import { useKomutaFilters } from "@/components/dashboard/komuta/KomutaShell";
import { useKomutaQuery } from "@/components/dashboard/komuta/useKomutaQuery";
import { KomutaCustomersPanel } from "@/components/dashboard/komuta/KomutaCustomersPanel";
import { KomutaTrendyolLoyalty } from "@/components/dashboard/komuta/KomutaTrendyolLoyalty";
import { ChannelSplitSheet, type ChannelSplitData } from "@/components/dashboard/komuta/ChannelSplitSheet";
import { StatStrip, StripStat } from "@/components/dashboard/komuta/KomutaUI";
import { SectionTitle } from "@/components/dashboard/komuta/SectionTitle";

// Komuta › Müşteri — kanal segmentleri, sadakat (kohort) ve en değerli müşteriler.
export default function KomutaCustomersPage() {
  const { period, channel, dayOffset, label, refreshKey } = useKomutaFilters();
  const [split, setSplit] = useState<ChannelSplitData | null>(null);

  // Kohortlar yalnız kendi siparişlerden (DB) hesaplanır. Genel Bakış'la ortak sorgu.
  const { data: insights, isLoading: loading } = useKomutaQuery<DashboardInsights>(
    "insights",
    [period, channel, dayOffset],
    { refreshKey },
  );

  const openCustomerSplit = (c: KomutaCustomerRow) => {
    setSplit({
      title: c.name && c.name !== "—" ? c.name : c.phone ?? "Trendyol müşterisi",
      subtitle: `${formatCurrencyShort(c.total)} · ${c.own.orders + c.trendyol.orders} sipariş · ${label}`,
      own: { value: `${c.own.orders} sip · ${formatCurrencyShort(c.own.revenue)}`, raw: c.own.revenue },
      trendyol: {
        value: `${c.trendyol.orders} sip · ${formatCurrencyShort(c.trendyol.revenue)}`,
        raw: c.trendyol.revenue,
      },
      ordersQuery: {
        period,
        channel,
        dayOffset,
        phone: c.phone ?? undefined,
        trendyolId: c.trendyolId ?? undefined,
      },
    });
  };

  const trendyolLoyalty = (
    <KomutaTrendyolLoyalty
      period={period}
      dayOffset={dayOffset}
      title={<SectionTitle>Sadakat · Trendyol</SectionTitle>}
    />
  );

  return (
    <>
      <KomutaCustomersPanel
        period={period}
        channel={channel}
        dayOffset={dayOffset}
        showLegend={channel === "all"}
        onCustomerClick={openCustomerSplit}
        cohorts={
          channel !== "trendyol" ? (
            <>
              <SectionTitle>Sadakat · kendi siparişler</SectionTitle>
              <StatStrip className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
                <StripStat label="Bu dönem aktif" value={String(insights?.cohorts.activeInPeriod ?? 0)} isLoading={loading} />
                <StripStat label="Yeni" value={String(insights?.cohorts.newInPeriod ?? 0)} tone="good" isLoading={loading} />
                <StripStat label="Dönen" value={String(insights?.cohorts.returningInPeriod ?? 0)} isLoading={loading} />
                <StripStat
                  label="Tekrar oranı"
                  value={`%${(insights?.cohorts.repeatRate ?? 0).toFixed(0)}`}
                  sub="tüm zamanlar"
                  isLoading={loading}
                />
                <StripStat label="Soğuyan" value={String(insights?.cohorts.atRisk ?? 0)} tone="warn" sub="30–90 gün" isLoading={loading} />
                <StripStat label="Kayıp" value={String(insights?.cohorts.lost ?? 0)} tone="bad" sub="90+ gün" isLoading={loading} />
              </StatStrip>
              {channel === "all" && trendyolLoyalty}
            </>
          ) : (
            trendyolLoyalty
          )
        }
      />
      <ChannelSplitSheet data={split} onClose={() => setSplit(null)} />
    </>
  );
}
