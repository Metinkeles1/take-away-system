"use client";


import { type TrendyolLoyalty } from "@/actions/trendyolArchive";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { StatStrip, StripStat } from "./KomutaUI";
import { useKomutaFilters } from "./KomutaShell";
import { useKomutaQuery } from "./useKomutaQuery";

interface Props {
  period: DashboardPeriod;
  dayOffset: number;
  title: React.ReactNode;
}

// Trendyol müşteri sadakati — sipariş arşivinden (kalıcı geçmiş). Kendi
// müşterilerin "Sadakat" kartlarıyla aynı tanımlar (yeni/dönen/soğuyan/kayıp).
export function KomutaTrendyolLoyalty({ period, dayOffset, title }: Props) {
  const { refreshKey } = useKomutaFilters();
  const { data: d } = useKomutaQuery<TrendyolLoyalty>("tyLoyalty", [period, dayOffset], { refreshKey });
  const isLoading = d === null;
  if (d && !d.available) return null;

  const since = d?.archiveSince
    ? new Date(d.archiveSince).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })
    : null;

  return (
    <>
      {title}
      <StatStrip className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <StripStat
          label="Bu dönem aktif"
          value={d ? String(d.activeInPeriod) : "—"}
          isLoading={isLoading}
        />
        <StripStat
          label="Yeni"
          value={d ? String(d.newInPeriod) : "—"}
          tone="good"
          sub={since ? `arşiv ${since}'dan beri` : undefined}
          isLoading={isLoading}
        />
        <StripStat
          label="Dönen"
          value={d ? String(d.returningInPeriod) : "—"}
          isLoading={isLoading}
        />
        <StripStat
          label="Tekrar oranı"
          value={d ? `%${d.repeatRate.toFixed(0)}` : "—"}
          sub={d ? `${d.totalCustomers} müşteri` : undefined}
          isLoading={isLoading}
        />
        <StripStat
          label="Soğuyan"
          value={d ? String(d.atRisk) : "—"}
          tone="warn"
          sub="30–90 gün"
          isLoading={isLoading}
        />
        <StripStat
          label="Kayıp"
          value={d ? String(d.lost) : "—"}
          tone="bad"
          sub="90+ gün"
          isLoading={isLoading}
        />
      </StatStrip>
    </>
  );
}
