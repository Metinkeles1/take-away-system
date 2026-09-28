"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin, Plus, RefreshCw, TriangleAlert } from "lucide-react";

import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { OverviewRegionMap } from "@/components/dashboard/overview/OverviewRegionMap";
import { Segmented } from "./KomutaUI";
import { KomutaDatePicker, komutaPeriodLabel } from "./KomutaDatePicker";
import { retryFailedKomutaQueries, useKomutaQueryStatus } from "./useKomutaQuery";

// Komuta Merkezi çerçevesi: başlık + ortak filtreler (kanal, dönem, gün). Layout
// seviyesinde durduğu için Genel Bakış / Performans / Müşteri arasında geçerken
// filtre korunur; ayrıca adrese yazılır (?kanal=trendyol&donem=hafta&once=1) ki
// yenileme ve paylaşılan bağlantı aynı görünümü açsın.

export type KomutaChannel = OrderSource | "all";

const CHANNELS: { id: KomutaChannel; label: string; dot?: string; param: string }[] = [
  { id: "all", label: "Hepsi", param: "hepsi" },
  { id: "manual", label: "Kendi", dot: "bg-blue-500", param: "kendi" },
  { id: "trendyol", label: "Trendyol", dot: "bg-orange-500", param: "trendyol" },
];

const PERIODS: { id: DashboardPeriod; label: string; param: string }[] = [
  { id: "day", label: "Gün", param: "gun" },
  { id: "week", label: "Hafta", param: "hafta" },
  { id: "month", label: "Ay", param: "ay" },
];

const MAX_OFFSET: Record<DashboardPeriod, number> = { day: 365, week: 52, month: 24 };
const FOCUS_REFRESH_MS = 60_000;

const SECTIONS: { href: string; title: string }[] = [
  { href: "/komuta/performans", title: "Performans" },
  { href: "/komuta/musteri", title: "Müşteri" },
  { href: "/komuta", title: "Genel Bakış" },
];

interface KomutaFilters {
  channel: KomutaChannel;
  period: DashboardPeriod;
  dayOffset: number;
  /** Seçili dönemin kısa adı ("Bugün · 28 Eyl", "Bu Hafta"). */
  label: string;
  /** Yenile'ye basınca (ve pencereye dönünce, en fazla dakikada bir) artar;
   *  sorgular (useKomutaQuery) buna bağlanıp eldeki veriyi göstererek tazelenir. */
  refreshKey: number;
}

const Ctx = createContext<KomutaFilters | null>(null);

export function useKomutaFilters(): KomutaFilters {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKomutaFilters yalnız /komuta altında kullanılır");
  return v;
}

export function KomutaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();

  // İlk değer adresten; sonrasında kaynak bu state (sidebar linkleri query
  // taşımasa da layout ayakta kaldığı için filtre kaybolmaz).
  const [channel, setChannel] = useState<KomutaChannel>(
    () => CHANNELS.find((c) => c.param === params.get("kanal"))?.id ?? "all",
  );
  const [period, setPeriod] = useState<DashboardPeriod>(
    () => PERIODS.find((p) => p.param === params.get("donem"))?.id ?? "day",
  );
  const [dayOffset, setDayOffset] = useState(() => {
    const n = Number(params.get("once"));
    return Number.isInteger(n) && n > 0 ? n : 0;
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const { busy, failed, lastSuccessAt } = useKomutaQueryStatus();

  // Pencereye dönünce tazele — ama en fazla dakikada bir (her odakta tüm
  // sorguları yeniden atmak kuyruğu şişiriyordu).
  const lastFocusRefresh = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastFocusRefresh.current < FOCUS_REFRESH_MS) return;
      lastFocusRefresh.current = Date.now();
      setRefreshKey((k) => k + 1);
    };
    lastFocusRefresh.current = Date.now();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Filtreyi adrese yaz (varsayılanlar yazılmaz); diğer parametreler (ör. ?g=kurye) korunur.
  useEffect(() => {
    const next = new URLSearchParams(params.toString());
    const set = (k: string, v: string | null) => (v ? next.set(k, v) : next.delete(k));
    set("kanal", channel === "all" ? null : CHANNELS.find((c) => c.id === channel)!.param);
    set("donem", period === "day" ? null : PERIODS.find((p) => p.id === period)!.param);
    set("once", dayOffset > 0 ? String(dayOffset) : null);
    const qs = next.toString();
    // Sayfa geçişi başlatmadan adresi güncelle (Next useSearchParams'ı senkronlar);
    // router.replace, sidebar'dan yapılan geçişle yarışıp parametreyi düşürebiliyor.
    if (qs !== params.toString()) {
      window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}`);
    }
  }, [channel, period, dayOffset, pathname, params]);

  const label = komutaPeriodLabel(period, dayOffset);
  // Güncel dönem (bugün / son 7 / son 30 gün) şu anı kapsar → canlı.
  const isLive = dayOffset === 0;
  const title =
    SECTIONS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))?.title ??
    "Genel Bakış";

  useEffect(() => {
    document.title = `${title} · Komuta Merkezi`;
  }, [title]);

  const value = useMemo<KomutaFilters>(
    () => ({ channel, period, dayOffset, label, refreshKey }),
    [channel, period, dayOffset, label, refreshKey],
  );

  return (
    <Ctx.Provider value={value}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-7xl flex-col">
          {/* ─── Başlık ─── */}
          <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Komuta Merkezi</p>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "size-1.75 rounded-full",
                    isLive ? "bg-emerald-500 ring-3 ring-emerald-500/15" : "bg-muted-foreground/40",
                  )}
                />
                {isLive ? "Canlı" : "Geçmiş dönem"}
                {lastSuccessAt &&
                  ` · ${new Date(lastSuccessAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}'te güncellendi`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={busy}
                aria-label="Yenile"
                title="Yenile"
              >
                <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMapOpen(true)} className="h-8 gap-1.5">
                <MapPin className="size-3.5" />
                Harita
              </Button>
              <Button size="sm" asChild className="h-8 gap-1.5">
                <Link href="/orders/new">
                  <Plus className="size-3.5" />
                  Yeni Sipariş
                </Link>
              </Button>
            </div>
          </header>

          {/* ─── Filtreler — sayfa kayarken üstte kalır ─── */}
          <div className="sticky top-0 z-20 border-b bg-background/85 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                ariaLabel="Kanal"
                value={channel}
                onChange={setChannel}
                options={CHANNELS}
              />
              <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
              <Segmented
                ariaLabel="Dönem"
                value={period}
                onChange={(p) => {
                  setPeriod(p);
                  setDayOffset(0);
                }}
                options={PERIODS}
              />
              <div className="inline-flex h-8 items-center rounded-lg border bg-card shadow-xs">
                <button
                  type="button"
                  onClick={() => setDayOffset((o) => Math.min(MAX_OFFSET[period], o + 1))}
                  className="flex h-full w-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Önceki dönem"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <KomutaDatePicker
                  period={period}
                  offset={dayOffset}
                  maxOffset={MAX_OFFSET[period]}
                  onChange={setDayOffset}
                />
                <button
                  type="button"
                  onClick={() => setDayOffset((o) => Math.max(0, o - 1))}
                  disabled={dayOffset === 0}
                  className="flex h-full w-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Sonraki dönem"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              {dayOffset > 0 && (
                <button
                  type="button"
                  onClick={() => setDayOffset(0)}
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Şimdiye dön
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 p-4 sm:p-6 lg:px-8">
            {failed > 0 && (
              <div
                role="alert"
                className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
              >
                <TriangleAlert className="size-4 shrink-0" />
                <span className="flex-1">
                  Bazı veriler yüklenemedi{failed > 1 ? ` (${failed} bölüm)` : ""}. Bağlantı ya da
                  Trendyol kaynaklı olabilir.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 border-rose-200 bg-transparent dark:border-rose-900"
                  onClick={retryFailedKomutaQueries}
                >
                  Tekrar dene
                </Button>
              </div>
            )}
            {children}
          </div>
        </div>
      </div>

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Siparişler Nereden Geldi</DialogTitle>
            <DialogDescription>
              {label} · {CHANNELS.find((c) => c.id === channel)?.label} · pinli sipariş konumları
            </DialogDescription>
          </DialogHeader>
          {mapOpen && <OverviewRegionMap period={period} source={channel} dayOffset={dayOffset} />}
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
