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
  Package as PackageIcon,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency } from "@/lib/utils";

const RegionsMap = dynamic(
  () => import("./RegionsMap").then((m) => m.RegionsMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-120 w-full rounded-md" />,
  },
);

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInputValue(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

const LEGEND = [
  { label: "Yeni", color: "#3b82f6" },
  { label: "Kabul", color: "#f59e0b" },
  { label: "Hazırlandı", color: "#8b5cf6" },
  { label: "Yolda", color: "#f97316" },
  { label: "Teslim", color: "#10b981" },
];

export function RegionsTab() {
  const [period, setPeriod] = useState<TrendyolRegionPeriod>("today");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [todayValue, setTodayValue] = useState<string>("");
  const [data, setData] = useState<TrendyolRegionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);

  useEffect(() => {
    const t = toDateInputValue(new Date());
    setTodayValue(t);
    setSelectedDate(t);
  }, []);

  const isToday = selectedDate === todayValue && todayValue !== "";

  const load = useCallback(async () => {
    if (!selectedDate) return;
    setIsLoading(true);
    try {
      const refDate = parseDateInputValue(selectedDate).getTime();
      const r = await getTrendyolRegions(period, refDate);
      setData(r);
      setSelectedDistrict(null);
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedDate]);

  useEffect(() => {
    if (selectedDate) load();
  }, [load, selectedDate]);

  const pinsToShow = useMemo(() => {
    if (!data) return [];
    if (!selectedDistrict) return data.pins;
    return data.pins.filter((p) => p.district === selectedDistrict);
  }, [data, selectedDistrict]);

  const selectedDistrictData = useMemo(() => {
    if (!data || !selectedDistrict) return null;
    return data.districts.find((d) => d.name === selectedDistrict) ?? null;
  }, [data, selectedDistrict]);

  const periodLabel = useMemo(() => {
    if (!selectedDate) return "";
    if (period === "today") {
      if (isToday) return "Bugün";
      return parseDateInputValue(selectedDate).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
      });
    }
    if (period === "week") return isToday ? "Son 7 Gün" : "7 Günlük";
    return isToday ? "Son 30 Gün" : "30 Günlük";
  }, [period, isToday, selectedDate]);

  const totalNeighborhoods =
    data?.districts.reduce((s, d) => s + d.neighborhoods.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">Bölgeler</h2>
          <p className="text-sm text-muted-foreground">
            {periodLabel} · Mahalle bazlı sipariş haritası ve ürün kırılımı
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={period}
            onValueChange={(v) => setPeriod(v as TrendyolRegionPeriod)}
          >
            <TabsList>
              <TabsTrigger value="today" disabled={isLoading}>
                {isToday ? "Bugün" : "Gün"}
              </TabsTrigger>
              <TabsTrigger value="week" disabled={isLoading}>
                {isToday ? "Son 7 Gün" : "7 Gün"}
              </TabsTrigger>
              <TabsTrigger value="month" disabled={isLoading}>
                {isToday ? "Son 30 Gün" : "30 Gün"}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <input
            type="date"
            value={selectedDate}
            max={todayValue}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={isLoading}
            suppressHydrationWarning
            className="h-8 rounded-md border bg-background px-2.5 text-sm tabular-nums outline-none transition focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={isLoading}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>
      </div>

      {data?.error && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Trendyol API&apos;sına ulaşılamadı</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{data.error}</p>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile
          icon={Building2}
          label="İlçe"
          value={data ? String(data.districts.length) : "—"}
          loading={isLoading && !data}
        />
        <KpiTile
          icon={Home}
          label="Mahalle"
          value={data ? String(totalNeighborhoods) : "—"}
          loading={isLoading && !data}
        />
        <KpiTile
          icon={MapPin}
          label="Haritada Pin"
          value={data ? `${data.withCoordinates} / ${data.totalOrders}` : "—"}
          loading={isLoading && !data}
        />
        <KpiTile
          icon={TrendingUp}
          label="Toplam Ciro"
          value={data ? formatCurrency(data.totalRevenue) : "—"}
          loading={isLoading && !data}
        />
      </div>

      {/* Map + district list */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              Sipariş Haritası
              {selectedDistrict && (
                <span className="text-xs font-normal text-muted-foreground">
                  · {selectedDistrict} ({pinsToShow.length} pin)
                </span>
              )}
              {selectedDistrict && (
                <button
                  type="button"
                  onClick={() => setSelectedDistrict(null)}
                  className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-foreground hover:text-foreground/80"
                >
                  <X className="size-3" /> filtreyi kaldır
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Sabit yükseklikli wrapper: harita yüklenirken altındaki content kaymasın (CLS fix) */}
            <div className="relative w-full" style={{ minHeight: 480 }}>
              {isLoading && !data ? (
                <Skeleton className="h-120 w-full" />
              ) : data && data.pins.length > 0 ? (
                <RegionsMap pins={pinsToShow} bounds={data.bounds} height={480} />
              ) : (
                <div className="flex h-120 items-center justify-center">
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
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
              {LEGEND.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full border border-white"
                    style={{
                      backgroundColor: s.color,
                      boxShadow: "0 0 0 1px var(--border)",
                    }}
                  />
                  <span className="text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              İlçeler
            </CardTitle>
            <CardDescription>
              Bir ilçeye tıkla → harita ve ürün kırılımı süzülür
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full" style={{ minHeight: 384 }}>
              {isLoading && !data ? (
                <Skeleton className="h-96 w-full" />
              ) : (
                <DistrictList
                  districts={data?.districts ?? []}
                  selected={selectedDistrict}
                  onSelect={setSelectedDistrict}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seçili ilçe — mahalle + ürün */}
      {selectedDistrictData && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="size-4 text-muted-foreground" />
                {selectedDistrictData.name} · Mahalleler
              </CardTitle>
              <CardDescription>
                {selectedDistrictData.neighborhoods.length} mahalle ·{" "}
                {selectedDistrictData.count} sipariş
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NeighborhoodList items={selectedDistrictData.neighborhoods} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageIcon className="size-4 text-muted-foreground" />
                {selectedDistrictData.name} · En Çok Sipariş Edilen Ürün
              </CardTitle>
              <CardDescription>İlk 5 · adet bazlı</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedDistrictData.topProducts.length === 0 ? (
                <EmptyState icon={PackageIcon} text="Ürün verisi yok" />
              ) : (
                <DistrictProductsList products={selectedDistrictData.topProducts} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── KPI tile ──────────────────────────────────────────────────────

function KpiTile({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <CardDescription className="text-sm font-medium text-muted-foreground">
          {label}
        </CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <p className="text-xl font-bold tabular-nums tracking-tight">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── District list ─────────────────────────────────────────────────

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
    <ul className="max-h-105 space-y-1.5 overflow-y-auto pr-1">
      {districts.map((d, i) => {
        const pct = (d.count / maxCount) * 100;
        const active = selected === d.name;
        return (
          <li key={d.name}>
            <button
              type="button"
              onClick={() => onSelect(active ? null : d.name)}
              className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                active
                  ? "border-foreground/30 bg-muted"
                  : "border-transparent bg-card hover:bg-muted/50"
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{d.name}</span>
                <span className="shrink-0 text-xs tabular-nums">
                  <span className="font-semibold">×{d.count}</span>
                  <span className="ml-2 text-muted-foreground">
                    {formatCurrency(d.revenue)}
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(pct, 3)}%`,
                    background: `var(--chart-${(i % 5) + 1})`,
                  }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Neighborhood list ─────────────────────────────────────────────

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
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((n) => {
        const pct = (n.count / maxCount) * 100;
        return (
          <li
            key={n.name}
            className="rounded-md border bg-card p-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{n.name}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">
                ×{n.count}
              </span>
            </div>
            <div className="mb-1 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/40"
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {formatCurrency(n.revenue)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── District products ─────────────────────────────────────────────

function DistrictProductsList({
  products,
}: {
  products: { name: string; quantity: number; revenue: number }[];
}) {
  const max = Math.max(...products.map((p) => p.quantity), 1);
  return (
    <ul className="space-y-3">
      {products.map((p, i) => {
        const pct = (p.quantity / max) * 100;
        return (
          <li key={p.name} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">
                <span className="mr-1.5 inline-block size-5 rounded-sm text-center text-[10px] font-bold leading-5 text-muted-foreground">
                  #{i + 1}
                </span>
                {p.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums">
                <span className="font-semibold">×{p.quantity}</span>
                <span className="ml-2 text-muted-foreground">
                  {formatCurrency(p.revenue)}
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(pct, 5)}%`,
                  background: `var(--chart-${(i % 5) + 1})`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
