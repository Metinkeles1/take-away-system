"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getTrendyolMenu,
  updateTrendyolPrices,
  getTrendyolPriceBatchResult,
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
  Pencil,
  Loader2,
  Upload,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency } from "@/lib/utils";
import {
  getCampaignGroup,
  calcCampaignDiscount,
  TRENDYOL_COMMISSION_RATE,
} from "@/lib/trendyolCampaigns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Filter = "all" | "active" | "inactive" | "out_of_stock";

// Trendyol kuyruğu işleyene kadar batch sonucunu poll et (max ~20sn).
async function pollBatchResult(batchRequestId: string) {
  for (let i = 0; i < 10; i++) {
    const res = await getTrendyolPriceBatchResult(batchRequestId);
    if (res.ok && res.completed) return res;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

export function MenuTab() {
  const [data, setData] = useState<TrendyolMenuResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Fiyat düzenleme
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);

  // Kampanya indirimi gösterimi — Grup 1 sabit (sadeleştirildi).
  const [includeFlash, setIncludeFlash] = useState(true);
  const [includeCommission, setIncludeCommission] = useState(false);

  // Bir ürünün o an geçerli fiyatı (düzenleme modunda taslak değer öncelikli).
  const effectivePrice = useCallback(
    (productId: number, basePrice: number) => {
      const raw = drafts[productId];
      if (raw !== undefined) {
        const v = parseFloat(raw.replace(",", "."));
        if (Number.isFinite(v) && v > 0) return v;
      }
      return basePrice;
    },
    [drafts],
  );

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

  // Yalnızca canlı menü API'sinde fiyat düzenlemeye izin ver (fallback verisi yaklaşık).
  const canEdit = data?.source === "api";

  // Değişen (geçerli + farklı) fiyatlar.
  const changes = useMemo(() => {
    if (!data) return [];
    const out: {
      productId: number;
      name: string;
      oldPrice: number;
      sellingPrice: number;
    }[] = [];
    for (const item of data.items) {
      const raw = drafts[item.productId];
      if (raw === undefined) continue;
      const val = parseFloat(raw.replace(",", "."));
      if (!Number.isFinite(val) || val <= 0) continue;
      if (Math.round(val * 100) / 100 === Math.round(item.price * 100) / 100)
        continue;
      out.push({
        productId: item.productId,
        name: item.name,
        oldPrice: item.price,
        sellingPrice: Math.round(val * 100) / 100,
      });
    }
    return out;
  }, [data, drafts]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setDrafts({});
  }, []);

  const handleSend = useCallback(async () => {
    if (changes.length === 0) return;
    setSending(true);
    try {
      const res = await updateTrendyolPrices(
        changes.map((c) => ({
          productId: c.productId,
          sellingPrice: c.sellingPrice,
        })),
      );
      if (!res.ok || !res.batchRequestId) {
        toast.error(res.error ?? "Fiyat güncelleme gönderilemedi.");
        return;
      }
      toast.success(
        `${changes.length} ürün kuyruğa alındı, sonuç bekleniyor...`,
      );

      const result = await pollBatchResult(res.batchRequestId);
      if (!result) {
        toast.message(
          "Sonuç henüz gelmedi. Birkaç dakika sonra Yenile ile kontrol edebilirsin.",
        );
      } else {
        const failed =
          result.failedItemCount ??
          result.items.filter((i) => i.status.toUpperCase() !== "SUCCESS")
            .length;
        if (failed > 0) {
          const reason = result.items.find(
            (i) => i.failureReasons.length > 0,
          )?.failureReasons[0];
          toast.error(
            `${failed} ürün güncellenemedi.${reason ? ` (${reason})` : ""}`,
          );
        } else {
          toast.success(
            `Tüm fiyatlar güncellendi (${result.itemCount ?? changes.length} ürün).`,
          );
        }
      }
      setDrafts({});
      setEditing(false);
      await load();
    } catch {
      toast.error("Fiyat güncelleme sırasında bir hata oluştu.");
    } finally {
      setSending(false);
    }
  }, [changes, load]);

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
    <div className="h-full flex flex-col gap-4 min-h-0">
      {data.error && (
        <div className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Menü API kullanılamadı — paket geçmişinden çıkarıldı</p>
            <p className="mt-0.5 text-amber-800">{data.error}</p>
          </div>
        </div>
      )}

      {/* Özet KPI'lar */}
      <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3">
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
      <Card className="shrink-0 bg-white rounded-2xl border shadow-sm">
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
              disabled={isLoading || sending}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Yenile
            </Button>

            {canEdit &&
              (editing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditing}
                  disabled={sending}
                >
                  Vazgeç
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Fiyat Düzenle
                </Button>
              ))}
          </div>

          {/* Kampanya indirim ayarları (Grup 1) — her ürünün indirim/net tutarını belirler */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <span className="rounded-md bg-orange-500 px-2 py-0.5 text-white">Grup 1</span>
              indirimi
            </span>

            <div className="ml-auto flex items-center gap-2">
              <ToggleChip
                label="Flaş dahil"
                active={includeFlash}
                tone="violet"
                onClick={() => setIncludeFlash((v) => !v)}
              />
              <ToggleChip
                label={`Komisyon hariç %${Math.round(TRENDYOL_COMMISSION_RATE * 100)}`}
                active={includeCommission}
                tone="rose"
                onClick={() => setIncludeCommission((v) => !v)}
              />
            </div>
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

      {/* Ürün grid'i — yalnızca bu alan kayar, scroll gizli */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-1">
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
                  {editing ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">₺</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={drafts[item.productId] ?? String(item.price)}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [item.productId]: e.target.value,
                          }))
                        }
                        className="w-24 rounded-lg border px-2 py-1 text-sm font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-orange-200"
                      />
                    </div>
                  ) : (
                    <span className="text-base font-bold text-emerald-700">
                      {formatCurrency(item.price)}
                    </span>
                  )}
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

                <DiscountInfo
                  price={effectivePrice(item.productId, item.price)}
                  includeFlash={includeFlash}
                  includeCommission={includeCommission}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Sabit alt çubuk: bekleyen fiyat değişiklikleri + onaylı gönderim */}
      {editing && changes.length > 0 && (
        <div className="shrink-0 rounded-xl border bg-white/95 px-4 py-3 shadow-lg backdrop-blur supports-backdrop-filter:bg-white/80">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-700">
              <span className="font-bold text-orange-600">{changes.length}</span>{" "}
              üründe fiyat değişikliği bekliyor
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelEditing}
                disabled={sending}
              >
                Vazgeç
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="gap-2" disabled={sending}>
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Trendyol&apos;a Gönder
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Fiyatlar Trendyol&apos;a gönderilsin mi?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {changes.length} ürünün satış fiyatı canlı menüde
                      güncellenecek. Bu işlem geri alınamaz.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="max-h-64 overflow-y-auto rounded-lg border divide-y text-sm">
                    {changes.map((c) => (
                      <div
                        key={c.productId}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="truncate text-gray-700">{c.name}</span>
                        <span className="shrink-0 tabular-nums">
                          <span className="text-gray-400 line-through">
                            {formatCurrency(c.oldPrice)}
                          </span>{" "}
                          <span className="font-semibold text-emerald-700">
                            {formatCurrency(c.sellingPrice)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={sending}>
                      Vazgeç
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleSend} disabled={sending}>
                      Gönder
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Açık/kapalı durum chip'i (Flaş dahil / Komisyon hariç).
function ToggleChip({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "violet" | "rose";
  onClick: () => void;
}) {
  const on =
    tone === "violet"
      ? "border-violet-300 bg-violet-50 text-violet-700"
      : "border-rose-300 bg-rose-50 text-rose-700";
  const knob = tone === "violet" ? "bg-violet-500" : "bg-rose-500";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? on : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
      }`}
    >
      {label}
      <span
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          active ? knob : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
            active ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

// Ürün fiyatının Grup 1 kampanyasında denk geldiği indirim + net/hakediş tutarı.
// includeCommission → indirim sonrası tutardan %12 Trendyol komisyonu da düşülür.
function DiscountInfo({
  price,
  includeFlash,
  includeCommission,
}: {
  price: number;
  includeFlash: boolean;
  includeCommission: boolean;
}) {
  const r = calcCampaignDiscount(getCampaignGroup(1)!, price, includeFlash);
  const discount = r.discount;
  const isFlash = r.source === "flash";
  const noDiscountHint =
    discount === 0 && r.nextTier
      ? `${formatCurrency(r.amountToNextTier)} daha → −${formatCurrency(r.nextTier.discount)}`
      : null;

  const afterDiscount = Math.max(0, price - discount);
  const commission = includeCommission
    ? afterDiscount * TRENDYOL_COMMISSION_RATE
    : 0;
  const finalAmount = afterDiscount - commission;

  // İndirim yok + komisyon da kapalı → sade bilgi satırı.
  if (discount === 0 && !includeCommission) {
    return (
      <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-400">
        {noDiscountHint ? `İndirim yok · ${noDiscountHint}` : "İndirim yok"}
      </div>
    );
  }

  const bg = discount === 0 ? "bg-gray-50" : isFlash ? "bg-violet-50" : "bg-orange-50";
  const fg = isFlash ? "text-violet-700" : "text-orange-700";
  const pct = Math.round(TRENDYOL_COMMISSION_RATE * 100);

  return (
    <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${bg}`}>
      <div className="flex items-center justify-between gap-2">
        {discount > 0 ? (
          <span className={`inline-flex items-center gap-1 font-semibold ${fg}`}>
            {isFlash && <Zap className="h-3 w-3" />}
            −{formatCurrency(discount)}
            {isFlash && " · Flaş"}
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">İndirim yok</span>
        )}
        <span className="text-gray-500">
          {includeCommission ? "Hakediş" : "Net"}{" "}
          <span className="font-bold text-gray-900 tabular-nums">
            {formatCurrency(finalAmount)}
          </span>
        </span>
      </div>
      {includeCommission && (
        <div className="mt-0.5 text-right text-[10px] text-gray-400">
          {formatCurrency(afterDiscount)} − %{pct} komisyon ={" "}
          {formatCurrency(finalAmount)}
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
