"use client";

// Trendyol menü yönetimi: canlı menü, satır içi fiyat düzenleme (toplu gönderim),
// ürün/kategori satışa aç-kapa ve kampanya kademelerine göre ürün başına
// indirim → müşterinin ödediği → hakediş hesabı.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Settings2,
  Undo2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  getTrendyolMenu,
  setTrendyolProductStatus,
  setTrendyolSectionStatus,
  updateTrendyolPrices,
  type TrendyolMenuItem,
  type TrendyolMenuResult,
  type TrendyolMenuSectionInfo,
} from "@/actions/trendyolMenu";
import {
  getCampaignSettings,
  type CampaignSettings,
} from "@/actions/trendyolCampaignSettings";
import type { CampaignGroup } from "@/lib/trendyolCampaigns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CampaignSettingsSheet } from "./CampaignSettingsSheet";
import {
  breakdown,
  exportMenuCsv,
  formatTl,
  parseAmount,
  type PriceBreakdown,
} from "./pricing";

type StatusFilter = "all" | "on" | "off";
type Change = { productId: number; name: string; oldPrice: number; newPrice: number };

const OTHER_GROUP = -1; // hiçbir kategoride olmayan ürünler

function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replaceAll("ç", "c")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s");
}

export function MenuTab() {
  const [data, setData] = useState<TrendyolMenuResult | null>(null);
  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sectionId, setSectionId] = useState<number | null>(null);

  const [drafts, setDrafts] = useState<Record<number, number>>({});
  const [priceErrors, setPriceErrors] = useState<Record<number, string>>({});
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);

  const [busyProducts, setBusyProducts] = useState<Set<number>>(new Set());
  const [busySections, setBusySections] = useState<Set<number>>(new Set());
  const [confirmSection, setConfirmSection] = useState<TrendyolMenuSectionInfo | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState(0);

  // ── Yükleme ──
  const loadingRef = useRef(false);
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const [menu, campaign] = await Promise.all([getTrendyolMenu(), getCampaignSettings()]);
      setData(menu);
      setSettings(campaign);
    } catch {
      toast.error("Menü yüklenemedi.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = data?.source === "api";

  const group: CampaignGroup | null = useMemo(
    () => settings?.groups.find((g) => g.id === settings.activeGroupId) ?? null,
    [settings],
  );
  const calc = useCallback(
    (price: number): PriceBreakdown | null =>
      group && settings ? breakdown(group, price, settings.commissionRate) : null,
    [group, settings],
  );

  const sectionMap = useMemo(
    () => new Map((data?.sections ?? []).map((s) => [s.id, s])),
    [data],
  );
  const realSections = useMemo(
    () => (data?.sections ?? []).filter((s) => !s.curated),
    [data],
  );
  const curatedSections = useMemo(
    () => (data?.sections ?? []).filter((s) => s.curated),
    [data],
  );

  // Ürün müşteriye görünüyor mu: kendisi açık + (kategorisi yoksa ya da en az biri açık).
  const isOnSale = useCallback(
    (item: TrendyolMenuItem) =>
      item.isActive &&
      (item.sectionIds.length === 0 ||
        item.sectionIds.some((id) => sectionMap.get(id)?.active !== false)),
    [sectionMap],
  );

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    const on = items.filter(isOnSale).length;
    return { all: items.length, on, off: items.length - on };
  }, [data, isOnSale]);

  // ── Görünen liste: filtre + kategori gruplama ──
  const groups = useMemo(() => {
    if (!data) return [];
    const q = normalizeTr(search.trim());
    const byId = new Map(data.items.map((i) => [i.productId, i]));
    const match = (item: TrendyolMenuItem) => {
      if (status === "on" && !isOnSale(item)) return false;
      if (status === "off" && isOnSale(item)) return false;
      if (q && !normalizeTr(`${item.name} ${item.description ?? ""}`).includes(q)) return false;
      return true;
    };

    if (sectionId !== null) {
      const s = sectionMap.get(sectionId);
      if (!s) return [];
      const items = s.productIds
        .map((id) => byId.get(id))
        .filter((i): i is TrendyolMenuItem => !!i && match(i));
      return [{ section: s, items }];
    }

    // Tüm menü: her ürün ilk (menü sırasındaki) kategorisinde bir kez görünür.
    const placed = new Set<number>();
    const out: { section: TrendyolMenuSectionInfo | null; items: TrendyolMenuItem[] }[] = [];
    for (const s of realSections) {
      const items: TrendyolMenuItem[] = [];
      for (const id of s.productIds) {
        const item = byId.get(id);
        if (!item || placed.has(id)) continue;
        placed.add(id);
        if (match(item)) items.push(item);
      }
      if (items.length) out.push({ section: s, items });
    }
    const rest = data.items.filter((i) => !placed.has(i.productId) && match(i));
    if (rest.length) out.push({ section: null, items: rest });
    return out;
  }, [data, search, status, sectionId, sectionMap, realSections, isOnSale]);

  const visibleCount = groups.reduce((n, g) => n + g.items.length, 0);

  // ── Fiyat taslakları ──
  const changes: Change[] = useMemo(() => {
    if (!data) return [];
    return data.items
      .filter((i) => drafts[i.productId] !== undefined)
      .map((i) => ({
        productId: i.productId,
        name: i.name,
        oldPrice: i.price,
        newPrice: drafts[i.productId],
      }));
  }, [data, drafts]);

  const setDraft = useCallback((item: TrendyolMenuItem, value: number | null) => {
    setDrafts((d) => {
      const next = { ...d };
      if (value === null || value === item.price) delete next[item.productId];
      else next[item.productId] = value;
      return next;
    });
    setPriceErrors((e) => {
      if (!(item.productId in e)) return e;
      const next = { ...e };
      delete next[item.productId];
      return next;
    });
  }, []);

  const sendPrices = async () => {
    if (changes.length === 0) return;
    setSending(true);
    const t = toast.loading(`${changes.length} fiyat Trendyol'a gönderiliyor…`);
    try {
      const res = await updateTrendyolPrices(
        changes.map((c) => ({ productId: c.productId, sellingPrice: c.newPrice })),
      );
      if (!res.ok) {
        toast.error(res.error ?? "Fiyatlar gönderilemedi.", { id: t });
        return;
      }
      // Başarılı (ya da hâlâ işlenen) fiyatları ekrana hemen yansıt; Trendyol menü
      // listesi yeni fiyatı birkaç dakika gecikmeli döndürebiliyor.
      const applied = new Set(
        res.pending ? changes.map((c) => c.productId) : res.succeeded,
      );
      setData((prev) =>
        prev && {
          ...prev,
          items: prev.items.map((i) =>
            applied.has(i.productId) ? { ...i, price: drafts[i.productId] ?? i.price } : i,
          ),
        },
      );
      setDrafts((d) => {
        const next = { ...d };
        for (const id of applied) delete next[id];
        return next;
      });
      setPriceErrors(Object.fromEntries(res.failed.map((f) => [f.productId, f.reason])));

      if (res.pending) {
        toast.message("Trendyol fiyatları işliyor. Birkaç dakika sonra Yenile ile doğrulayın.", { id: t });
      } else if (res.failed.length > 0) {
        toast.error(
          `${res.succeeded.length} fiyat güncellendi, ${res.failed.length} ürün reddedildi: ${res.failed[0].reason}`,
          { id: t },
        );
      } else {
        toast.success(`${res.succeeded.length} ürünün fiyatı güncellendi.`, { id: t });
      }
    } catch {
      toast.error("Fiyat gönderimi sırasında hata oluştu.", { id: t });
    } finally {
      setSending(false);
      setConfirmSend(false);
    }
  };

  // ── Satışa aç/kapa ──
  const toggleProduct = useCallback(async (item: TrendyolMenuItem) => {
    const next = !item.isActive;
    const patch = (active: boolean) =>
      setData((prev) =>
        prev && {
          ...prev,
          items: prev.items.map((i) =>
            i.productId === item.productId ? { ...i, isActive: active } : i,
          ),
        },
      );
    setBusyProducts((s) => new Set(s).add(item.productId));
    patch(next);
    const res = await setTrendyolProductStatus(item.storeId, item.productId, next);
    if (!res.ok) {
      patch(!next);
      toast.error(res.error ?? "Ürün durumu değiştirilemedi.");
    } else {
      toast.success(`${item.name} ${next ? "satışa açıldı" : "satıştan kaldırıldı"}`);
    }
    setBusyProducts((s) => {
      const n = new Set(s);
      n.delete(item.productId);
      return n;
    });
  }, []);

  const toggleSection = useCallback(async (section: TrendyolMenuSectionInfo) => {
    const next = !section.active;
    const patch = (active: boolean) =>
      setData((prev) =>
        prev && {
          ...prev,
          sections: prev.sections.map((s) => (s.id === section.id ? { ...s, active } : s)),
        },
      );
    setBusySections((s) => new Set(s).add(section.id));
    patch(next);
    const res = await setTrendyolSectionStatus(section.storeId, section.id, next);
    if (!res.ok) {
      patch(!next);
      toast.error(res.error ?? "Kategori durumu değiştirilemedi.");
    } else {
      toast.success(`${section.name} ${next ? "satışa açıldı" : "satıştan kaldırıldı"}`);
    }
    setBusySections((s) => {
      const n = new Set(s);
      n.delete(section.id);
      return n;
    });
  }, []);

  // Kategori kapatmak çok ürünü etkiler → onay iste; açmak doğrudan.
  const requestSectionToggle = useCallback(
    (s: TrendyolMenuSectionInfo) => (s.active ? setConfirmSection(s) : toggleSection(s)),
    [toggleSection],
  );

  // ── Render ──
  if (loading && !data) return <MenuSkeleton />;

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-6">
        {data?.error && <ErrorBanner title="Menü verisi alınamadı" text={data.error} />}
        <EmptyState icon={Package} text="Menüde ürün bulunamadı" />
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Tekrar dene
          </Button>
        </div>
      </div>
    );
  }

  const fetchedTime = new Date(data.fetchedAt).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-4">
      {data.source === "fallback" && (
        <ErrorBanner
          title="Canlı menüye ulaşılamadı — son siparişlerden çıkarılan liste gösteriliyor (düzenleme kapalı)"
          text={data.error}
        />
      )}

      {/* ── Başlık + kampanya şeridi ── */}
      <div className="rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-gray-900">Menü</h1>
            <p className="text-xs text-gray-500">
              {counts.all} ürün · <span className="text-emerald-700">{counts.on} satışta</span>
              {counts.off > 0 && <> · <span className="text-gray-700">{counts.off} kapalı</span></>}
              {" · "}
              {fetchedTime} itibarıyla
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              calc(0) &&
              exportMenuCsv(
                groups.flatMap((g) => g.items),
                (id) => sectionMap.get(id)?.name ?? "",
                (p) => calc(p)!,
              )
            }
            disabled={visibleCount === 0 || !group}
            className="gap-1.5"
            title="Görünen ürünleri Excel (CSV) olarak indir"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading || sending} className="gap-1.5">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            <span className="hidden sm:inline">Yenile</span>
          </Button>
        </div>

        {settings && group && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-gray-50/70 px-4 py-3">
            <TierSummary group={group} />
            <button
              type="button"
              onClick={() => {
                setSettingsKey((k) => k + 1);
                setSettingsOpen(true);
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-white hover:text-gray-900"
            >
              <Settings2 className="h-4 w-4" />
              Grup {group.id} · komisyon %{Math.round(settings.commissionRate * 1000) / 10}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {/* ── Kategori menüsü (masaüstü) ── */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-0 space-y-0.5 rounded-2xl border bg-white p-2">
            <SectionLink label="Tüm menü" count={counts.all} selected={sectionId === null} onClick={() => setSectionId(null)} />
            <div className="my-1 border-t" />
            {realSections.map((s) => (
              <SectionLink
                key={s.id}
                label={s.name}
                count={s.productIds.length}
                closed={!s.active}
                selected={sectionId === s.id}
                onClick={() => setSectionId(s.id)}
              />
            ))}
            {curatedSections.length > 0 && (
              <>
                <p className="px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Trendyol vitrini
                </p>
                {curatedSections.map((s) => (
                  <SectionLink
                    key={s.id}
                    label={s.name}
                    count={s.productIds.length}
                    closed={!s.active}
                    selected={sectionId === s.id}
                    onClick={() => setSectionId(s.id)}
                  />
                ))}
              </>
            )}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-3">
          {/* ── Arama + durum filtresi ── */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün ara…"
                className="h-9 w-full rounded-lg border bg-white pl-9 pr-8 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Aramayı temizle"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="Duruma göre filtrele">
              <span className="text-xs font-medium text-gray-500">Göster:</span>
              <FilterButton label="Tümü" count={counts.all} selected={status === "all"} onClick={() => setStatus("all")} />
              <FilterButton label="Satışta" count={counts.on} selected={status === "on"} onClick={() => setStatus("on")} />
              <FilterButton label="Kapalı" count={counts.off} selected={status === "off"} onClick={() => setStatus("off")} />
            </div>
          </div>

          {/* Kategori şeridi (mobil/tablet) */}
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-hide lg:hidden">
            <Chip label="Tüm menü" selected={sectionId === null} onClick={() => setSectionId(null)} />
            {[...realSections, ...curatedSections].map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                closed={!s.active}
                selected={sectionId === s.id}
                onClick={() => setSectionId(s.id)}
              />
            ))}
          </div>

          {/* ── Ürün listesi ── */}
          {visibleCount === 0 ? (
            <div className="rounded-2xl border bg-white">
              <EmptyState icon={Search} text="Bu filtreye uyan ürün yok" />
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-white">
              <div className="hidden border-b bg-gray-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 md:grid md:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_7rem_3rem] md:gap-3">
                <span>Ürün</span>
                <span className="text-right">Fiyat</span>
                <span className="text-right">İndirim</span>
                <span className="text-right">Müşteri öder</span>
                <span className="text-right">Hakediş</span>
                <span className="text-right">Satış</span>
              </div>

              {groups.map(({ section, items }) => (
                <div key={section?.id ?? OTHER_GROUP}>
                  <GroupHeader
                    section={section}
                    count={items.length}
                    canEdit={canEdit}
                    busy={section ? busySections.has(section.id) : false}
                    onToggle={requestSectionToggle}
                  />
                  <div className="divide-y">
                    {items.map((item) => (
                      <ProductRow
                        key={item.productId}
                        item={item}
                        draft={drafts[item.productId]}
                        error={priceErrors[item.productId]}
                        onSale={isOnSale(item)}
                        calc={calc}
                        canEdit={canEdit}
                        busy={busyProducts.has(item.productId)}
                        onDraft={setDraft}
                        onToggle={toggleProduct}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {group && (
            <p className="px-1 text-xs text-gray-400">
              İndirim, ürün tek başına sepete eklenmiş gibi hesaplanır; normal ve flaş kademeden
              hangisi büyükse o uygulanır. Hakediş = müşterinin ödediği − %{Math.round((settings?.commissionRate ?? 0) * 1000) / 10} komisyon.
            </p>
          )}
        </div>
      </div>

      {/* ── Bekleyen fiyat değişiklikleri ── */}
      {changes.length > 0 && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg">
          <p className="flex-1 text-sm text-amber-900">
            <b>{changes.length}</b> üründe fiyat değişikliği gönderilmeyi bekliyor
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDrafts({});
              setPriceErrors({});
            }}
            disabled={sending}
            className="gap-1.5 text-amber-900 hover:bg-amber-100"
          >
            <Undo2 className="h-4 w-4" />
            Geri al
          </Button>
          <Button size="sm" onClick={() => setConfirmSend(true)} disabled={sending} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Trendyol&apos;a gönder
          </Button>
        </div>
      )}

      {/* Fiyat gönderim onayı */}
      <AlertDialog open={confirmSend} onOpenChange={(o) => !sending && setConfirmSend(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fiyatlar Trendyol&apos;da güncellensin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              {changes.length} ürünün satış fiyatı canlı menüde değişecek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 divide-y overflow-y-auto rounded-lg border text-sm">
            {changes.map((c) => (
              <div key={c.productId} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate text-gray-700">{c.name}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-gray-400 line-through">{formatTl(c.oldPrice)}</span>{" "}
                  <b className={c.newPrice > c.oldPrice ? "text-emerald-700" : "text-rose-700"}>
                    {formatTl(c.newPrice)}
                  </b>
                </span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // sonuç gelene kadar açık kalsın
                sendPrices();
              }}
              disabled={sending}
              className="gap-1.5"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {sending ? "Gönderiliyor…" : "Gönder"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kategori kapatma onayı */}
      <AlertDialog open={!!confirmSection} onOpenChange={(o) => !o && setConfirmSection(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmSection?.name} satıştan kaldırılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              Kategorideki {confirmSection?.productIds.length ?? 0} ürün Trendyol&apos;da görünmez olur.
              İstediğiniz zaman tekrar açabilirsiniz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmSection) toggleSection(confirmSection);
                setConfirmSection(null);
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Satıştan kaldır
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {settings && (
        <CampaignSettingsSheet
          key={settingsKey}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onSaved={setSettings}
        />
      )}
    </div>
  );
}

// ─── Parçalar ───────────────────────────────────────────────────────────

function MenuSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="flex gap-4">
        <Skeleton className="hidden h-96 w-56 rounded-2xl lg:block" />
        <Skeleton className="h-96 flex-1 rounded-2xl" />
      </div>
    </div>
  );
}

function ErrorBanner({ title, text }: { title: string; text?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        {text && <p className="mt-0.5 text-xs text-amber-800">{text}</p>}
      </div>
    </div>
  );
}

// Durum filtresi düğmesi: seçiliyken dolu, değilse çerçeveli; sayı rozetiyle.
function FilterButton({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium shadow-sm transition-colors",
        selected
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-xs tabular-nums",
          selected ? "bg-white/25 text-white" : "bg-gray-100 text-gray-600",
        )}
      >
        {count}
      </span>
    </button>
  );
}

// Aktif grubun kademeleri (normal + flaş).
function TierSummary({ group }: { group: CampaignGroup }) {
  const tiers = [
    ...group.tiers.map((t) => ({ ...t, flash: false })),
    ...group.flash.map((t) => ({ ...t, flash: true })),
  ].sort((a, b) => a.min - b.min || a.discount - b.discount);
  if (tiers.length === 0) return <span className="text-xs text-gray-400">Bu grupta kademe yok</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tiers.map((t, i) => (
        <span
          key={i}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs tabular-nums",
            t.flash ? "bg-violet-100 text-violet-800" : "bg-orange-100 text-orange-800",
          )}
        >
          {t.flash && <Zap className="h-3 w-3" />}
          {formatTl(t.min)}+ → <b>−{formatTl(t.discount)}</b>
        </span>
      ))}
    </div>
  );
}

function SectionLink({
  label,
  count,
  closed,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  closed?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
        selected ? "bg-emerald-50 font-medium text-emerald-800" : "text-gray-700 hover:bg-gray-50",
      )}
    >
      <span className={cn("min-w-0 flex-1 truncate", closed && "text-gray-400 line-through")}>{label}</span>
      <span className="text-xs tabular-nums text-gray-400">{count}</span>
    </button>
  );
}

function Chip({
  label,
  closed,
  selected,
  onClick,
}: {
  label: string;
  closed?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors",
        selected
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:border-emerald-400 hover:bg-emerald-50",
        closed && !selected && "text-gray-400 line-through",
      )}
    >
      {label}
    </button>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  busy,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  busy?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChange}
      disabled={disabled || busy}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed",
        checked ? "bg-emerald-500" : "bg-gray-300",
        disabled && !busy && "opacity-50",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4.5" : "translate-x-0.5",
        )}
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
      </span>
    </button>
  );
}

function GroupHeader({
  section,
  count,
  canEdit,
  busy,
  onToggle,
}: {
  section: TrendyolMenuSectionInfo | null;
  count: number;
  canEdit: boolean;
  busy: boolean;
  onToggle: (s: TrendyolMenuSectionInfo) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-y bg-gray-50/80 px-4 py-2 first:border-t-0">
      <h2 className={cn("text-sm font-semibold", section && !section.active ? "text-gray-400" : "text-gray-900")}>
        {section?.name ?? "Kategorisiz"}
      </h2>
      <span className="text-xs tabular-nums text-gray-400">{count}</span>
      {section && !section.active && (
        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
          Kategori kapalı
        </span>
      )}
      {section && canEdit && (
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-gray-500 sm:inline">Kategori satışta</span>
          <Switch
            checked={section.active}
            busy={busy}
            onChange={() => onToggle(section)}
            label={section.active ? "Kategoriyi satıştan kaldır" : "Kategoriyi satışa aç"}
          />
        </div>
      )}
    </div>
  );
}

const ProductRow = memo(function ProductRow({
  item,
  draft,
  error,
  onSale,
  calc,
  canEdit,
  busy,
  onDraft,
  onToggle,
}: {
  item: TrendyolMenuItem;
  draft: number | undefined;
  error: string | undefined;
  onSale: boolean;
  calc: (price: number) => PriceBreakdown | null;
  canEdit: boolean;
  busy: boolean;
  onDraft: (item: TrendyolMenuItem, value: number | null) => void;
  onToggle: (item: TrendyolMenuItem) => void;
}) {
  const price = draft ?? item.price;
  const b = calc(price);
  const sectionClosed = item.isActive && !onSale;

  const discountCell = b ? (
    b.discount > 0 ? (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium",
          b.source === "flash" ? "text-violet-700" : "text-orange-700",
        )}
      >
        {b.source === "flash" && <Zap className="h-3 w-3" />}−{formatTl(b.discount)}
      </span>
    ) : (
      <span className="text-gray-400" title="Bir sonraki kademeye kalan tutar">
        {b.hint ?? "—"}
      </span>
    )
  ) : null;

  return (
    <div
      className={cn(
        "px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_7rem_3rem] md:items-center md:gap-3",
        draft !== undefined && "bg-amber-50/60",
        !onSale && draft === undefined && "bg-gray-50/60",
      )}
    >
      {/* Ürün */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className={cn("text-sm font-medium", onSale ? "text-gray-900" : "text-gray-400")}>{item.name}</h3>
            {!item.isActive && (
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">Kapalı</span>
            )}
            {sectionClosed && (
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                Kategorisi kapalı
              </span>
            )}
          </div>
          {item.description && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{item.description}</p>}
          {item.modifiers && (
            <p className="mt-0.5 truncate text-[11px] text-gray-400">Seçenekler: {item.modifiers.join(", ")}</p>
          )}
          {error && <p className="mt-1 text-xs text-rose-600">Trendyol reddetti: {error}</p>}
        </div>
        {/* Mobil: fiyat + anahtar sağda */}
        <div className="flex items-center gap-3 md:hidden">
          <PriceCell item={item} draft={draft} canEdit={canEdit} onDraft={onDraft} />
          {canEdit && (
            <Switch
              checked={item.isActive}
              busy={busy}
              onChange={() => onToggle(item)}
              label={item.isActive ? "Satıştan kaldır" : "Satışa aç"}
            />
          )}
        </div>
      </div>

      {/* Mobil: kampanya özeti tek satır */}
      {b && (
        <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-gray-500 md:hidden">
          {discountCell}
          <span>öder <b className="text-gray-800">{formatTl(b.customerPays)}</b></span>
          <span>hakediş <b className="text-emerald-700">{formatTl(b.payout)}</b></span>
        </p>
      )}

      {/* Masaüstü hücreleri */}
      <div className="hidden justify-self-end md:block">
        <PriceCell item={item} draft={draft} canEdit={canEdit} onDraft={onDraft} />
      </div>
      <div className="hidden text-right text-xs tabular-nums md:block">{discountCell}</div>
      <div className="hidden text-right text-sm tabular-nums text-gray-800 md:block">
        {b && formatTl(b.customerPays)}
      </div>
      <div className="hidden text-right text-sm font-semibold tabular-nums text-emerald-700 md:block">
        {b && formatTl(b.payout)}
      </div>
      <div className="hidden justify-self-end md:block">
        {canEdit ? (
          <Switch
            checked={item.isActive}
            busy={busy}
            onChange={() => onToggle(item)}
            label={item.isActive ? "Satıştan kaldır" : "Satışa aç"}
          />
        ) : (
          <span className="text-xs text-gray-400">{item.isActive ? "Açık" : "Kapalı"}</span>
        )}
      </div>
    </div>
  );
});

// Fiyat: tıklayınca yerinde düzenlenir. Enter/odak kaybı = taslağa al, Esc = vazgeç.
function PriceCell({
  item,
  draft,
  canEdit,
  onDraft,
}: {
  item: TrendyolMenuItem;
  draft: number | undefined;
  canEdit: boolean;
  onDraft: (item: TrendyolMenuItem, value: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const price = draft ?? item.price;

  const commit = () => {
    const v = parseAmount(text);
    if (v > 0) onDraft(item, v);
    else if (text.trim() !== "") toast.error("Geçerli bir fiyat girin.");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex h-8 w-24 items-center rounded-lg border border-emerald-400 bg-white px-2 ring-2 ring-emerald-100">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full min-w-0 bg-transparent text-right text-sm font-semibold tabular-nums outline-none"
        />
        <span className="ml-1 text-xs text-gray-400">₺</span>
      </div>
    );
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => {
          setText(String(price).replace(".", ","));
          setEditing(true);
        }}
        title={canEdit ? "Fiyatı değiştirmek için tıklayın" : undefined}
        className={cn(
          "rounded-md px-1.5 py-0.5 text-sm font-semibold tabular-nums transition-colors",
          canEdit && "cursor-text underline decoration-gray-300 decoration-dashed underline-offset-4 hover:bg-gray-100",
          draft !== undefined ? "text-amber-700" : "text-gray-900",
        )}
      >
        {formatTl(price)}
      </button>
      {draft !== undefined && (
        <div className="flex items-center justify-end gap-1 text-[11px] text-gray-400">
          <span className="line-through">{formatTl(item.price)}</span>
          <button
            type="button"
            onClick={() => onDraft(item, null)}
            aria-label="Değişikliği geri al"
            className="rounded p-0.5 hover:bg-gray-200 hover:text-gray-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
