"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getTrendyolMenu,
  type TrendyolMenuResult,
} from "@/actions/trendyolMenu";
import {
  Package,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  Filter as FilterIcon,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency } from "@/lib/utils";

type Filter = "all" | "active" | "inactive" | "out_of_stock";

export function MenuTab() {
  const [data, setData] = useState<TrendyolMenuResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getTrendyolMenu();
      setData(result);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (filter === "active" && !item.isActive) return false;
      if (filter === "inactive" && item.isActive) return false;
      if (filter === "out_of_stock" && item.inStock) return false;
      if (activeCategory && (item.category ?? "Kategorisiz") !== activeCategory)
        return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, filter, activeCategory]);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardContent className="py-10">
          {data?.error && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 text-sm text-amber-900 mb-4">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Menü verisi alınamadı</p>
                <p className="text-xs mt-0.5 text-amber-800">{data.error}</p>
              </div>
            </div>
          )}
          <EmptyState icon={Package} text="Menü ürünü bulunamadı" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Menü API kullanılamadı — paket geçmişinden çıkarıldı</p>
            <p className="mt-0.5 text-amber-800">{data.error}</p>
          </div>
        </div>
      )}

      {/* Özet KPI'lar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          icon={Package}
          label="Toplam Ürün"
          value={String(data.totalCount)}
          tone="blue"
        />
        <MetricTile
          icon={CheckCircle2}
          label="Aktif"
          value={String(data.activeCount)}
          tone="emerald"
        />
        <MetricTile
          icon={XCircle}
          label="Stokta Yok"
          value={String(data.outOfStockCount)}
          tone="amber"
        />
        <MetricTile
          icon={FilterIcon}
          label="Kategori"
          value={String(data.categories.length)}
          tone="violet"
        />
      </div>

      {/* Filtreler */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-50">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün ara..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>

            <div className="inline-flex rounded-lg border bg-white p-0.5">
              {(
                [
                  { k: "all" as const, label: "Tümü" },
                  { k: "active" as const, label: "Aktif" },
                  { k: "inactive" as const, label: "Pasif" },
                  { k: "out_of_stock" as const, label: "Stok Yok" },
                ] as const
              ).map(({ k, label }) => {
                const active = filter === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      active
                        ? "bg-orange-500 text-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
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

          {/* Kategori chip'leri */}
          {data.categories.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  activeCategory === null
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Tüm Kategoriler · {data.totalCount}
              </button>
              {data.categories.map((cat) => {
                const active = activeCategory === cat.name;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setActiveCategory(active ? null : cat.name)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                      active
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {cat.name} · {cat.count}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ürün grid'i */}
      {filtered.length === 0 ? (
        <Card className="bg-white rounded-2xl border shadow-sm">
          <CardContent className="py-8">
            <EmptyState icon={Search} text="Bu filtreye uyan ürün yok" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <div
              key={item.productId}
              className={`rounded-2xl border bg-white overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
                !item.isActive ? "opacity-60" : ""
              }`}
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-32 object-cover bg-gray-100"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-32 bg-linear-to-br from-orange-50 to-amber-50 flex items-center justify-center">
                  <Package className="h-10 w-10 text-orange-300" />
                </div>
              )}
              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-sm text-gray-900 line-clamp-2">
                    {item.name}
                  </h3>
                </div>
                {item.category && (
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-2">
                    {item.category}
                  </span>
                )}
                {item.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                    {item.description}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="text-base font-bold text-emerald-700">
                    {formatCurrency(item.price)}
                  </span>
                  <div className="flex items-center gap-1">
                    {!item.inStock && (
                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        Stokta Yok
                      </span>
                    )}
                    {!item.isActive && (
                      <span className="text-[10px] font-semibold bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                        Pasif
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone: "blue" | "emerald" | "amber" | "violet";
}) {
  const tones = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-600" },
    emerald: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      icon: "text-emerald-600",
    },
    amber: { bg: "bg-amber-50", text: "text-amber-700", icon: "text-amber-600" },
    violet: {
      bg: "bg-violet-50",
      text: "text-violet-700",
      icon: "text-violet-600",
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
      <p className={`mt-1.5 text-xl font-bold ${tones.text}`}>{value}</p>
    </div>
  );
}
