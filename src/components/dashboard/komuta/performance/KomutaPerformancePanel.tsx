"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Bike, Package } from "lucide-react";

import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";
import { Segmented } from "../KomutaUI";
import { ProductPerformance } from "./ProductPerformance";
import { CourierPerformance } from "./CourierPerformance";

export type PerfView = "urun" | "kurye";

const VIEWS: { id: PerfView; label: string; icon: React.ElementType }[] = [
  { id: "urun", label: "Ürünler", icon: Package },
  { id: "kurye", label: "Kuryeler", icon: Bike },
];

// Komuta › Performans: ürün satış hareketi + kurye teslim süreleri. Görünüm
// adreste (?g=kurye) — Genel Bakış'taki "Dikkat" şeridi doğrudan açabilsin.
export function KomutaPerformancePanel({
  period,
  channel,
  dayOffset,
}: {
  period: DashboardPeriod;
  channel: OrderSource | "all";
  dayOffset: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const view: PerfView = params.get("g") === "kurye" ? "kurye" : "urun";

  const setView = (v: PerfView) => {
    const next = new URLSearchParams(params.toString());
    if (v === "kurye") next.set("g", "kurye");
    else next.delete("g");
    const qs = next.toString();
    window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Segmented ariaLabel="Performans görünümü" value={view} onChange={setView} options={VIEWS} className="self-start" />
      {view === "urun" ? (
        <ProductPerformance period={period} channel={channel} dayOffset={dayOffset} />
      ) : (
        <CourierPerformance period={period} channel={channel} dayOffset={dayOffset} />
      )}
    </div>
  );
}
