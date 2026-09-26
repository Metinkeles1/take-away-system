"use client";

import { useEffect, useState } from "react";

import { getTrendyolLoyalty, type TrendyolLoyalty } from "@/actions/trendyolArchive";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { InsightStat } from "@/components/dashboard/overview/InsightStat";

interface Props {
  period: DashboardPeriod;
  dayOffset: number;
  title: React.ReactNode;
}

// Trendyol müşteri sadakati — sipariş arşivinden (kalıcı geçmiş). Kendi
// müşterilerin "Sadakat" kartlarıyla aynı tanımlar (yeni/dönen/soğuyan/kayıp).
export function KomutaTrendyolLoyalty({ period, dayOffset, title }: Props) {
  const key = `${period}|${dayOffset}`;
  const [fetched, setFetched] = useState<{ key: string; data: TrendyolLoyalty } | null>(null);

  useEffect(() => {
    let alive = true;
    getTrendyolLoyalty(period, dayOffset).then((r) => {
      if (alive) setFetched({ key, data: r });
    });
    return () => {
      alive = false;
    };
  }, [period, dayOffset, key]);

  const d = fetched?.key === key ? fetched.data : null;
  const isLoading = d === null;
  if (d && !d.available) return null;

  const since = d?.archiveSince
    ? new Date(d.archiveSince).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })
    : null;

  return (
    <>
      {title}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <InsightStat
          label="Bu Dönem Aktif"
          value={d ? String(d.activeInPeriod) : "—"}
          isLoading={isLoading}
        />
        <InsightStat
          label="Yeni"
          value={d ? String(d.newInPeriod) : "—"}
          tone="emerald"
          sub={since ? `arşiv ${since}'dan beri` : undefined}
          isLoading={isLoading}
        />
        <InsightStat
          label="Dönen"
          value={d ? String(d.returningInPeriod) : "—"}
          isLoading={isLoading}
        />
        <InsightStat
          label="Tekrar Oranı"
          value={d ? `%${d.repeatRate.toFixed(0)}` : "—"}
          sub={d ? `${d.totalCustomers} müşteri` : undefined}
          isLoading={isLoading}
        />
        <InsightStat
          label="Soğuyan"
          value={d ? String(d.atRisk) : "—"}
          tone="amber"
          sub="30–90 gün"
          isLoading={isLoading}
        />
        <InsightStat
          label="Kayıp"
          value={d ? String(d.lost) : "—"}
          tone="rose"
          sub="90+ gün"
          isLoading={isLoading}
        />
      </section>
    </>
  );
}
