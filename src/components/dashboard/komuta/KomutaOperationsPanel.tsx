"use client";

import { useEffect, useState } from "react";

import {
  getKomutaOperations,
  type KomutaOperations,
  type KomutaRegionRow,
} from "@/actions/komutaOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";
import { KomutaRankList, type KomutaRankItem } from "./KomutaRankList";
import { KomutaHeatmap } from "./KomutaHeatmap";

interface Props {
  period: DashboardPeriod;
  channel: OrderSource | "all";
  dayOffset: number;
  showLegend: boolean;
  onRegionClick: (region: KomutaRegionRow) => void;
}

// Operasyon: Bölge Dağılımı (kanal kırılımlı, tıklanır) + Saat Bazlı Yoğunluk.
// Kendi verisini çeker (operasyona özel ağır sorgu — Genel Bakış'ı yavaşlatmaz).
export function KomutaOperationsPanel({
  period,
  channel,
  dayOffset,
  showLegend,
  onRegionClick,
}: Props) {
  const [ops, setOps] = useState<KomutaOperations | null>(null);

  useEffect(() => {
    let alive = true;
    setOps(null);
    getKomutaOperations(period, channel, dayOffset).then((r) => {
      if (alive) setOps(r);
    });
    return () => {
      alive = false;
    };
  }, [period, channel, dayOffset]);

  const regions = ops?.regions ?? [];
  const maxRegion = Math.max(1, ...regions.map((r) => r.total));
  const regionItems: KomutaRankItem[] = regions.map((r) => ({
    id: r.name,
    label: r.name,
    primary: `${r.total} sip · Kendi ${r.own} / TY ${r.trendyol}`,
    ownShare: (r.own / maxRegion) * 100,
    tyShare: (r.trendyol / maxRegion) * 100,
  }));

  return (
    <div className="flex flex-col gap-4">
      <KomutaRankList
        title="Bölge Dağılımı"
        items={regionItems}
        isLoading={ops === null}
        emptyText="Bu dönemde bölge verisi yok (siparişlerde mahalle/bölge kayıtlı değil)."
        hint="Satıra tıkla → o bölgenin siparişleri"
        showLegend={showLegend}
        onItemClick={(name) => {
          const r = regions.find((x) => x.name === name);
          if (r) onRegionClick(r);
        }}
      />
      <KomutaHeatmap hourly={ops?.hourly ?? []} isLoading={ops === null} />
    </div>
  );
}
