"use client";

import { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import {
  getTrendyolMenu,
  updateTrendyolPrices,
  getTrendyolPriceBatchResult,
  setTrendyolProductStatus,
  setTrendyolSectionStatus,
  type TrendyolMenuResult,
  type TrendyolMenuItem,
} from "@/actions/trendyolMenu";
import {
  Package,
  AlertTriangle,
  Search,
  RefreshCw,
  Pencil,
  Loader2,
  Upload,
  Zap,
  ChevronDown,
  Power,
  X,
  LayoutGrid,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { cn, formatCurrency } from "@/lib/utils";
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

// Grup 1 kampanya objesi — her satır render'ında find çalışmasın diye modül sabiti.
const GROUP_1 = getCampaignGroup(1)!;

// Bir CSV hücresini kaçır: çift tırnakla sar, içteki tırnağı ikiye katla.
function csvCell(v: string | number): string {
  return `"${String(v).replaceAll('"', '""')}"`;
}

// Türkçe Excel uyumlu sayı: ondalık virgül, binlik ayraç yok ("120.5" → "120,5").
function csvNumber(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

// Mevcut (filtrelenmiş) menüyü Excel'de açılabilen CSV olarak indir.
// İndirim/Net sütunları ekrandaki Flaş/Komisyon ayarına göre hesaplanır.
function exportMenuCsv(
  items: TrendyolMenuItem[],
  opts: { includeFlash: boolean; includeCommission: boolean },
) {
  const headers = [
    "Ürün Adı",
    "Kategori",
    "Açıklama",
    "Fiyat (₺)",
    "İndirim (₺)",
    opts.includeCommission ? "Hakediş (₺)" : "Net (₺)",
    "Durum",
    "Stok",
    "Malzemeler",
    "Opsiyonlar",
  ];

  const rows = items.map((item) => {
    const r = calcCampaignDiscount(GROUP_1, item.price, opts.includeFlash);
    const afterDiscount = Math.max(0, item.price - r.discount);
    const finalAmount = opts.includeCommission
      ? afterDiscount - afterDiscount * TRENDYOL_COMMISSION_RATE
      : afterDiscount;
    return [
      item.name,
      item.categories?.length ? item.categories.join(", ") : (item.category ?? ""),
      item.description ?? "",
      csvNumber(item.price),
      r.discount > 0 ? csvNumber(r.discount) : "",
      csvNumber(finalAmount),
      item.isActive ? "Aktif" : "Pasif",
      item.inStock ? "Var" : "Yok",
      item.ingredients?.join(", ") ?? "",
      item.modifiers?.join(", ") ?? "",
    ];
  });

  // ; ayraç (TR Excel) + ﻿ BOM (Türkçe karakter + UTF-8 algılama).
  const csv =
    "﻿" +
    [headers, ...rows].map((cols) => cols.map(csvCell).join(";")).join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trendyol-menu-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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

  // Kampanya indirimi gösterimi — Grup 1 sabit.
  const [includeFlash, setIncludeFlash] = useState(true);
  const [includeCommission, setIncludeCommission] = useState(false);

  // Satışa aç/kapa
  const [busyProduct, setBusyProduct] = useState<number | null>(null);
  const [busySection, setBusySection] = useState<number | null>(null);
  const [showSections, setShowSections] = useState(false);

  // Bir ürünün taslak fiyatını güncelle (sabit referans → memoize'lı satır bozulmaz).
  const onDraftChange = useCallback((productId: number, value: string) => {
    setDrafts((d) => ({ ...d, [productId]: value }));
  }, []);

  // Eşzamanlı yüklemeleri teke indir (Yenile'ye üst üste basma / post-send reload).
  const loadingRef = useRef(false);
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    try {
      const result = await getTrendyolMenu();
      setData(result);
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Yalnızca canlı menü API'sinde fiyat düzenlemeye izin ver (fallback verisi yaklaşık).
  const canEdit = data?.source === "api";
  const inactiveCount = data ? data.totalCount - data.activeCount : 0;

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

  // Ürün satışa aç/kapa (optimistic; hata olursa geri al).
  const handleToggleProduct = useCallback(async (item: TrendyolMenuItem) => {
    const next = !item.isActive;
    setBusyProduct(item.productId);
    setData((prev) =>
      prev
        ? {
            ...prev,
            activeCount: prev.activeCount + (next ? 1 : -1),
            items: prev.items.map((i) =>
              i.productId === item.productId ? { ...i, isActive: next } : i,
            ),
          }
        : prev,
    );
    const res = await setTrendyolProductStatus(item.storeId, item.productId, next);
    if (!res.ok) {
      toast.error(res.error ?? "Ürün durumu güncellenemedi");
      setData((prev) =>
        prev
          ? {
              ...prev,
              activeCount: prev.activeCount + (next ? -1 : 1),
              items: prev.items.map((i) =>
                i.productId === item.productId ? { ...i, isActive: !next } : i,
              ),
            }
          : prev,
      );
    } else {
      toast.success(next ? `${item.name} satışa açıldı` : `${item.name} kapatıldı`);
    }
    setBusyProduct(null);
  }, []);

  // Kategori (section) satışa aç/kapa.
  const handleToggleSection = useCallback(
    async (section: { id: number; name: string; status: string; storeId: number }) => {
      const next = section.status.toUpperCase() !== "ACTIVE"; // pasifse aç
      setBusySection(section.id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.map((s) =>
                s.id === section.id ? { ...s, status: next ? "ACTIVE" : "PASSIVE" } : s,
              ),
            }
          : prev,
      );
      const res = await setTrendyolSectionStatus(section.storeId, section.id, next);
      if (!res.ok) {
        toast.error(res.error ?? "Kategori durumu güncellenemedi");
        setData((prev) =>
          prev
            ? {
                ...prev,
                sections: prev.sections.map((s) =>
                  s.id === section.id
                    ? { ...s, status: next ? "PASSIVE" : "ACTIVE" }
                    : s,
                ),
              }
            : prev,
        );
      } else {
        toast.success(
          next ? `${section.name} kategorisi açıldı` : `${section.name} kategorisi kapatıldı`,
        );
      }
      setBusySection(null);
    },
    [],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (filter === "active" && !item.isActive) return false;
      if (filter === "inactive" && item.isActive) return false;
      if (filter === "out_of_stock" && item.inStock) return false;
      if (activeCategory) {
        const cats = item.categories?.length ? item.categories : ["Kategorisiz"];
        if (!cats.includes(activeCategory)) return false;
      }
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, filter, activeCategory]);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-112 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        {data?.error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Menü verisi alınamadı</p>
              <p className="mt-0.5 text-xs text-amber-800">{data.error}</p>
            </div>
          </div>
        )}
        <EmptyState icon={Package} text="Menü ürünü bulunamadı" />
      </div>
    );
  }

  const filterDefs: { k: Filter; label: string; value: number; tone: Tone }[] = [
    { k: "all", label: "Toplam", value: data.totalCount, tone: "slate" },
    { k: "active", label: "Aktif", value: data.activeCount, tone: "emerald" },
    { k: "inactive", label: "Pasif", value: inactiveCount, tone: "gray" },
    { k: "out_of_stock", label: "Stokta Yok", value: data.outOfStockCount, tone: "amber" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {data.error && (
        <div className="flex shrink-0 items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Menü API kullanılamadı — paket geçmişinden çıkarıldı</p>
            <p className="mt-0.5 text-amber-800">{data.error}</p>
          </div>
        </div>
      )}

      {/* ── Üst kontrol paneli ── */}
      <div className="shrink-0 rounded-2xl border bg-white shadow-sm">
        {/* Satır 1: arama + aksiyonlar */}
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-50 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ürün ara..."
              className="h-9 w-full rounded-lg border bg-gray-50/60 pl-9 pr-8 text-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Kampanya gösterim ayarları */}
          <div className="flex items-center gap-1.5">
            <ToggleChip
              label="Flaş"
              active={includeFlash}
              tone="violet"
              onClick={() => setIncludeFlash((v) => !v)}
            />
            <ToggleChip
              label={`Net %${Math.round(TRENDYOL_COMMISSION_RATE * 100)}`}
              active={includeCommission}
              tone="rose"
              onClick={() => setIncludeCommission((v) => !v)}
            />
          </div>

          <div className="h-6 w-px bg-gray-200" />

          {canEdit && data.sections.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSections((v) => !v)}
              className={cn("gap-1.5", showSections && "border-orange-300 bg-orange-50 text-orange-700")}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Kategori durumu</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showSections && "rotate-180")} />
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={isLoading || sending}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            <span className="hidden sm:inline">Yenile</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportMenuCsv(filtered, { includeFlash, includeCommission })}
            disabled={filtered.length === 0}
            className="gap-1.5"
            title={`${filtered.length} ürünü CSV (Excel) olarak indir`}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Dışa Aktar</span>
          </Button>

          {canEdit &&
            (editing ? (
              <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={sending}>
                Vazgeç
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setEditing(true)}
                className="gap-1.5 bg-orange-500 text-white hover:bg-orange-600"
              >
                <Pencil className="h-4 w-4" />
                Fiyat Düzenle
              </Button>
            ))}
        </div>

        {/* Kategori satışa aç/kapa paneli (açılır) */}
        {showSections && canEdit && data.sections.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b bg-gray-50/60 p-3">
            {data.sections.map((s) => {
              const active = s.status.toUpperCase() === "ACTIVE";
              const busy = busySection === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleToggleSection(s)}
                  disabled={busy}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                    active
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-gray-300 bg-white text-gray-400 hover:bg-gray-50",
                  )}
                  title={active ? "Satışta — kapatmak için tıkla" : "Kapalı — açmak için tıkla"}
                >
                  {busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className={cn("h-2 w-2 rounded-full", active ? "bg-emerald-500" : "bg-gray-300")} />
                  )}
                  {s.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Satır 2: sayı + filtre segmentleri */}
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          {filterDefs.map((f) => (
            <StatFilter
              key={f.k}
              {...f}
              active={filter === f.k}
              onClick={() => setFilter(f.k)}
            />
          ))}
        </div>

        {/* Satır 3: kategori şeridi (yatay kaydırma) */}
        {data.categories.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide border-t px-3 py-2.5">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activeCategory === null
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
              )}
            >
              Tümü
            </button>
            {data.categories.map((cat) => {
              const active = activeCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveCategory(active ? null : cat.name)}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                  )}
                >
                  {cat.name}
                  <span className={cn("ml-1.5 tabular-nums", active ? "text-orange-100" : "text-gray-400")}>
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Ürün listesi — yalnızca bu alan kayar ── */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide pt-px">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-white py-10 shadow-sm">
            <EmptyState icon={Search} text="Bu filtreye uyan ürün yok" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            {/* Masaüstü sütun başlıkları */}
            <div className="hidden border-b bg-gray-50/80 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 xl:grid xl:grid-cols-[minmax(0,1fr)_8rem_15rem_7rem] xl:items-center xl:gap-6">
              <span>Ürün</span>
              <span className="text-right">Fiyat</span>
              <span>Kampanya / {includeCommission ? "Hakediş" : "Net"}</span>
              <span className="text-right">Durum</span>
            </div>
            <div className="divide-y">
              {filtered.map((item) => (
                <ProductRow
                  key={item.productId}
                  item={item}
                  editing={editing}
                  draftValue={drafts[item.productId]}
                  includeFlash={includeFlash}
                  includeCommission={includeCommission}
                  canEdit={canEdit}
                  isBusy={busyProduct === item.productId}
                  onDraftChange={onDraftChange}
                  onToggle={handleToggleProduct}
                />
              ))}
            </div>
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
              <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={sending}>
                Vazgeç
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="gap-2" disabled={sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Trendyol&apos;a Gönder
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Fiyatlar Trendyol&apos;a gönderilsin mi?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {changes.length} ürünün satış fiyatı canlı menüde güncellenecek. Bu işlem geri alınamaz.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="max-h-64 divide-y overflow-y-auto rounded-lg border text-sm">
                    {changes.map((c) => (
                      <div key={c.productId} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="truncate text-gray-700">{c.name}</span>
                        <span className="shrink-0 tabular-nums">
                          <span className="text-gray-400 line-through">{formatCurrency(c.oldPrice)}</span>{" "}
                          <span className="font-semibold text-emerald-700">{formatCurrency(c.sellingPrice)}</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={sending}>Vazgeç</AlertDialogCancel>
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

type Tone = "slate" | "emerald" | "gray" | "amber";

// Sayı + filtre birleşik segmenti. Hem KPI hem filtre butonu.
function StatFilter({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: Tone;
  active: boolean;
  onClick: () => void;
}) {
  const tones: Record<Tone, { dot: string; ring: string; text: string }> = {
    slate: { dot: "bg-slate-400", ring: "border-slate-300 bg-slate-50", text: "text-slate-700" },
    emerald: { dot: "bg-emerald-500", ring: "border-emerald-300 bg-emerald-50", text: "text-emerald-700" },
    gray: { dot: "bg-gray-400", ring: "border-gray-300 bg-gray-100", text: "text-gray-700" },
    amber: { dot: "bg-amber-500", ring: "border-amber-300 bg-amber-50", text: "text-amber-700" },
  };
  const t = tones[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all",
        active ? cn(t.ring, "shadow-sm ring-1 ring-inset ring-current") : "border-gray-200 bg-white hover:bg-gray-50",
      )}
    >
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", t.dot)} />
      <span className="min-w-0">
        <span className={cn("block text-lg font-bold leading-none tabular-nums", active ? t.text : "text-gray-900")}>
          {value}
        </span>
        <span className={cn("mt-0.5 block truncate text-[11px] font-medium", active ? t.text : "text-gray-500")}>
          {label}
        </span>
      </span>
    </button>
  );
}

// Açık/kapalı durum chip'i (Flaş / Net-komisyon).
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
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
        active ? on : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
      )}
    >
      {label}
      <span
        className={cn(
          "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
          active ? knob : "bg-gray-300",
        )}
      >
        <span
          className={cn(
            "inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform",
            active ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

// Tek ürün satırı — memoize: yalnızca propu değişen satır yeniden render olur.
const ProductRow = memo(function ProductRow({
  item,
  editing,
  draftValue,
  includeFlash,
  includeCommission,
  canEdit,
  isBusy,
  onDraftChange,
  onToggle,
}: {
  item: TrendyolMenuItem;
  editing: boolean;
  draftValue: string | undefined;
  includeFlash: boolean;
  includeCommission: boolean;
  canEdit: boolean;
  isBusy: boolean;
  onDraftChange: (productId: number, value: string) => void;
  onToggle: (item: TrendyolMenuItem) => void;
}) {
  // Düzenleme modunda geçerli/pozitif taslak değer öncelikli, yoksa gerçek fiyat.
  let effective = item.price;
  if (draftValue !== undefined) {
    const v = parseFloat(draftValue.replace(",", "."));
    if (Number.isFinite(v) && v > 0) effective = v;
  }

  return (
    <div
      className={cn(
        "group px-4 py-3.5 transition-colors hover:bg-gray-50/70 sm:px-5",
        "xl:grid xl:grid-cols-[minmax(0,1fr)_8rem_15rem_7rem] xl:items-center xl:gap-6",
        !item.isActive && "bg-gray-50/40",
      )}
    >
      {/* Kolon 1: thumbnail + ad + meta */}
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-linear-to-br from-orange-50 to-amber-50",
            !item.isActive && "opacity-60 grayscale",
          )}
        >
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <Package className="h-5 w-5 text-orange-300" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={cn("truncate text-sm font-semibold", item.isActive ? "text-gray-900" : "text-gray-500")}>
              {item.name}
            </h3>
            {!item.inStock && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                Stok Yok
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {item.category && (
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {item.category}
              </span>
            )}
            {item.description && (
              <span className="truncate text-xs text-gray-400">· {item.description}</span>
            )}
          </div>
          {Boolean(item.ingredients?.length || item.modifiers?.length) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.ingredients?.map((n, i) => (
                <span key={`ing-${i}`} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                  {n}
                </span>
              ))}
              {item.modifiers?.map((n, i) => (
                <span
                  key={`mod-${i}`}
                  className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                >
                  <Power className="h-2.5 w-2.5" />
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/*
        Mobil: fiyat + kampanya + aksiyon tek satırda alta sarar (flex).
        lg: wrapper "contents" olur → 3 çocuk doğrudan grid hücresi (2,3,4) olur.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-gray-100 pt-3 pl-14 xl:mt-0 xl:border-0 xl:pt-0 xl:pl-0 xl:contents">
        {/* Kolon 2: fiyat */}
        <div className="xl:justify-self-end">
          {editing ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">₺</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={draftValue ?? String(item.price)}
                onChange={(e) => onDraftChange(item.productId, e.target.value)}
                className="w-24 rounded-lg border px-2 py-1 text-right text-sm font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>
          ) : (
            <span className="text-base font-bold tabular-nums text-emerald-700">
              {formatCurrency(item.price)}
            </span>
          )}
        </div>

        {/* Kolon 3: kampanya / net */}
        <div className="min-w-0">
          <DiscountInfo
            price={effective}
            includeFlash={includeFlash}
            includeCommission={includeCommission}
          />
        </div>

        {/* Kolon 4: aç/kapa — mobilde sağa yaslı */}
        <div className="ml-auto xl:ml-0 xl:justify-self-end">
          {canEdit ? (
            <button
              type="button"
              onClick={() => onToggle(item)}
              disabled={isBusy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                item.isActive
                  ? "border-gray-200 text-gray-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
              )}
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              {item.isActive ? "Durdur" : "Aç"}
            </button>
          ) : (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                item.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500",
              )}
            >
              {item.isActive ? "Aktif" : "Pasif"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

// Ürün fiyatının Grup 1 kampanyasında denk geldiği indirim + net/hakediş tutarı.
// includeCommission → indirim sonrası tutardan %12 Trendyol komisyonu da düşülür.
const DiscountInfo = memo(function DiscountInfo({
  price,
  includeFlash,
  includeCommission,
}: {
  price: number;
  includeFlash: boolean;
  includeCommission: boolean;
}) {
  const r = calcCampaignDiscount(GROUP_1, price, includeFlash);
  const discount = r.discount;
  const isFlash = r.source === "flash";
  const noDiscountHint =
    discount === 0 && r.nextTier
      ? `${formatCurrency(r.amountToNextTier)} sonra −${formatCurrency(r.nextTier.discount)}`
      : null;

  const afterDiscount = Math.max(0, price - discount);
  const commission = includeCommission ? afterDiscount * TRENDYOL_COMMISSION_RATE : 0;
  const finalAmount = afterDiscount - commission;
  const pct = Math.round(TRENDYOL_COMMISSION_RATE * 100);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {discount > 0 ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold",
            isFlash ? "bg-violet-50 text-violet-700" : "bg-orange-50 text-orange-700",
          )}
        >
          {isFlash && <Zap className="h-3 w-3" />}
          −{formatCurrency(discount)}
          {isFlash && " Flaş"}
        </span>
      ) : noDiscountHint ? (
        <span className="text-[11px] text-gray-400">{noDiscountHint}</span>
      ) : (
        <span className="text-[11px] text-gray-300">İndirim yok</span>
      )}

      <span className="text-gray-500">
        {includeCommission ? "Hakediş" : "Net"}{" "}
        <span
          className="font-bold tabular-nums text-gray-900"
          title={
            includeCommission
              ? `${formatCurrency(afterDiscount)} − %${pct} komisyon = ${formatCurrency(finalAmount)}`
              : undefined
          }
        >
          {formatCurrency(finalAmount)}
        </span>
      </span>
    </div>
  );
});
