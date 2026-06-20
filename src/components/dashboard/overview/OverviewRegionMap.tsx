"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MapPinOff } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  getOverviewPins,
  type OverviewPins,
} from "@/actions/dashboardOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";

// Leaflet sadece client-side — bundle'ı düşürmek için lazy.
const RegionsMap = dynamic(
  () =>
    import("@/components/dashboard/trendyol/RegionsMap").then((m) => ({
      default: m.RegionsMap,
    })),
  { ssr: false, loading: () => <Skeleton className="h-[420px] w-full rounded-xl" /> },
);

interface Props {
  period: DashboardPeriod;
  source: OrderSource | "all";
  dayOffset: number;
}

// Siparişlerin geldiği konumlar — müşteri bazlı pin (kurye teslimde yakaladığı
// GPS) haritada. İlçe adı saklanmadığı için liste yerine harita gösteriyoruz.
export function OverviewRegionMap({ period, source, dayOffset }: Props) {
  const [data, setData] = useState<OverviewPins | null>(null);

  useEffect(() => {
    let alive = true;
    getOverviewPins(period, source, dayOffset).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [period, source, dayOffset]);

  const desc =
    data === null
      ? "Yükleniyor…"
      : data.pinnedCount > 0
        ? `${data.pinnedCount} pinli sipariş · ${data.totalOrders} toplam`
        : "Pinli sipariş yok";

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{desc}</p>
      {data === null ? (
        <Skeleton className="h-105 w-full rounded-xl" />
      ) : data.pins.length === 0 ? (
        <div className="flex h-105 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground">
          <MapPinOff className="mb-2 size-10 opacity-30" />
          <p className="text-sm">Bu dönemde pinli (konumlu) sipariş yok.</p>
          <p className="text-xs">
            Kurye teslimde konumu yakaladıkça müşteri pinleri burada birikir.
          </p>
        </div>
      ) : (
        <RegionsMap pins={data.pins} bounds={data.bounds} height={420} />
      )}
    </div>
  );
}
