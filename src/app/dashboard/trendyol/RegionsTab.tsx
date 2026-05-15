"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  getTrendyolRegions,
  type TrendyolRegionStats,
  type TrendyolRegionPeriod,
} from "@/actions/trendyolRegions";
import {
  MapPin,
  AlertTriangle,
  RefreshCw,
  Building2,
  Home,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency } from "@/lib/utils";

const RegionsMap = dynamic(
  () => import("./RegionsMap").then((m) => m.RegionsMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-120 w-full rounded-xl" />,
  },
);

export function RegionsTab() {
  const [period, setPeriod] = useState<TrendyolRegionPeriod>("today");
  const [data, setData] = useState<TrendyolRegionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await getTrendyolRegions(period);
      setData(r);
      setSelectedDistrict(null);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const pinsToShow = useMemo(() => {
    if (!data) return [];
    if (!selectedDistrict) return data.pins;
    return data.pins.filter((p) => p.district === selectedDistrict);
  }, [data, selectedDistrict]);

  const selectedDistrictData = useMemo(() => {
    if (!data || !selectedDistrict) return null;
    return data.districts.find((d) => d.name === selectedDistrict) ?? null;
  }, [data, selectedDistrict]);

  const periodLabel =
    period === "today" ? "Bugün" : period === "week" ? "Son 7 Gün" : "Son 30 Gün";

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="lg:col-span-2 h-120 rounded-xl" />
          <Skeleton className="h-120 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + filtre */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PeriodPicker period={period} onChange={setPeriod} disabled={isLoading} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      {data?.error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Trendyol API&apos;sına ulaşılamadı</p>
            <p className="text-xs mt-0.5 text-amber-800">{data.error}</p>
          </div>
        </div>
      )}

      {/* Özet KPI'lar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          icon={Building2}
          label={`${periodLabel} · İlçe`}
          value={String(data?.districts.length ?? 0)}
          tone="blue"
        />
        <Tile
          icon={Home}
          label="Mahalle"
          value={String(
            data?.districts.reduce(
              (s, d) => s + d.neighborhoods.length,
              0,
            ) ?? 0,
          )}
          tone="violet"
        />
        <Tile
          icon={MapPin}
          label="Haritada Pin"
          value={`${data?.withCoordinates ?? 0} / ${data?.totalOrders ?? 0}`}
          tone="orange"
        />
        <Tile
          icon={TrendingUp}
          label="Toplam Ciro"
          value={formatCurrency(data?.totalRevenue ?? 0)}
          tone="emerald"
        />
      </div>

      {/* Harita + ilçe listesi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-white rounded-2xl border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-orange-600" />
              Sipariş Haritası
              {selectedDistrict && (
                <span className="text-xs font-normal text-gray-500">
                  · {selectedDistrict} ({pinsToShow.length} pin)
                </span>
              )}
              {selectedDistrict && (
                <button
                  type="button"
                  onClick={() => setSelectedDistrict(null)}
                  className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 ml-1"
                >
                  filtreyi kaldır
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.pins.length > 0 ? (
              <RegionsMap pins={pinsToShow} bounds={data.bounds} height={480} />
            ) : (
              <div className="h-120 flex items-center justify-center">
                <EmptyState
                  icon={MapPin}
                  text={
                    data?.totalOrders === 0
                      ? "Bu dönemde Trendyol siparişi yok"
                      : "Sipariş adreslerinde koordinat yok"
                  }
                />
              </div>
            )}
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px]">
              {[
                { label: "Yeni", color: "#3b82f6" },
                { label: "Kabul", color: "#f59e0b" },
                { label: "Hazırlandı", color: "#8b5cf6" },
                { label: "Yolda", color: "#f97316" },
                { label: "Teslim", color: "#10b981" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-white"
                    style={{ backgroundColor: s.color, boxShadow: "0 0 0 1px #d1d5db" }}
                  />
                  <span className="text-gray-600">{s.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              İlçeler
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DistrictList
              districts={data?.districts ?? []}
              selected={selectedDistrict}
              onSelect={setSelectedDistrict}
            />
          </CardContent>
        </Card>
      </div>

      {/* Seçili ilçenin mahalleleri */}
      {selectedDistrictData && (
        <Card className="bg-white rounded-2xl border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Home className="h-4 w-4 text-violet-600" />
              {selectedDistrictData.name} · Mahalleler
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NeighborhoodList items={selectedDistrictData.neighborhoods} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PeriodPicker({
  period,
  onChange,
  disabled,
}: {
  period: TrendyolRegionPeriod;
  onChange: (p: TrendyolRegionPeriod) => void;
  disabled?: boolean;
}) {
  const opts: { k: TrendyolRegionPeriod; label: string }[] = [
    { k: "today", label: "Bugün" },
    { k: "week", label: "Son 7 Gün" },
    { k: "month", label: "Son 30 Gün" },
  ];
  return (
    <div className="inline-flex rounded-lg border bg-white p-0.5">
      {opts.map(({ k, label }) => {
        const active = k === period;
        return (
          <button
            key={k}
            type="button"
            disabled={disabled || active}
            onClick={() => onChange(k)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              active
                ? "bg-orange-500 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            } ${disabled && !active ? "opacity-50" : ""}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DistrictList({
  districts,
  selected,
  onSelect,
}: {
  districts: { name: string; count: number; revenue: number }[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  if (districts.length === 0) {
    return <EmptyState icon={Building2} text="İlçe verisi yok" />;
  }
  const maxCount = districts[0]?.count ?? 1;
  return (
    <ul className="space-y-1.5 max-h-110 overflow-y-auto pr-1">
      {districts.map((d) => {
        const pct = (d.count / maxCount) * 100;
        const active = selected === d.name;
        return (
          <li key={d.name}>
            <button
              type="button"
              onClick={() => onSelect(active ? null : d.name)}
              className={`w-full text-left rounded-lg border p-2 transition-colors ${
                active
                  ? "bg-orange-50 border-orange-300"
                  : "bg-white hover:bg-gray-50 border-gray-100"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {d.name}
                </span>
                <span className="text-xs tabular-nums shrink-0">
                  <span className="font-bold text-gray-900">×{d.count}</span>
                  <span className="text-emerald-700 ml-2">
                    {formatCurrency(d.revenue)}
                  </span>
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    active ? "bg-orange-500" : "bg-blue-400"
                  }`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NeighborhoodList({
  items,
}: {
  items: { name: string; count: number; revenue: number }[];
}) {
  if (items.length === 0) {
    return <EmptyState icon={Home} text="Mahalle verisi yok" />;
  }
  const maxCount = items[0]?.count ?? 1;
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map((n) => {
        const pct = (n.count / maxCount) * 100;
        return (
          <li
            key={n.name}
            className="rounded-lg border border-gray-100 bg-white p-2.5"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-sm font-medium text-gray-800 truncate">
                {n.name}
              </span>
              <span className="text-xs font-bold text-gray-900 tabular-nums">
                ×{n.count}
              </span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-1">
              <div
                className="h-full bg-violet-400 rounded-full"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="text-xs text-emerald-700 font-semibold">
              {formatCurrency(n.revenue)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone: "blue" | "emerald" | "violet" | "orange";
}) {
  const tones = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-600" },
    emerald: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      icon: "text-emerald-600",
    },
    violet: {
      bg: "bg-violet-50",
      text: "text-violet-700",
      icon: "text-violet-600",
    },
    orange: {
      bg: "bg-orange-50",
      text: "text-orange-700",
      icon: "text-orange-600",
    },
  }[tone];
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-1.5 ${tones.bg}`}>
          <Icon className={`h-4 w-4 ${tones.icon}`} />
        </div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className={`mt-1.5 text-lg font-bold ${tones.text}`}>{value}</p>
    </div>
  );
}
