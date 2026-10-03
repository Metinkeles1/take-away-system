"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, Loader2, Maximize, Minimize, PlusCircle, RefreshCw, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PanelSummary } from "@/actions/panel";
import type { CourierCashState } from "@/actions/courierCash";
import { cn } from "@/lib/utils";
import type { Order } from "@/types";

import { useNow, type PanelBoard } from "./usePanelData";
import { PanelOrderCard, ageMinutes, ageTone } from "./PanelOrderCard";
import { CourierPanel } from "./CourierPanel";
import { HourlyBars, PanelStats } from "./PanelStats";
import { useNewOrderAlert } from "./useNewOrderAlert";

// Panel görünümü — tek ekran, sayfa kaymaz. Üstte günün sayıları; altta solda
// canlı sipariş panosu (kurye bekleyen | kuryede), sağda kuryeler + saatlik
// sipariş. Ciro bilerek yok: panel dükkânda herkesin gördüğü ekranda açık durur.
// Uzun listeler yalnız kendi kutusunda kayar. Dar ekranda sekmelere bölünür.
// Veri sayfadan (src/app/page.tsx) gelir; bu bileşen yalnız ekranı çizer.

type Channel = "all" | "manual" | "trendyol";
type MobileTab = "waiting" | "assigned" | "couriers";

const DEFAULT_TARGET = 35;

export function PanelView({
  board,
  summary,
  cash,
  live,
  onChanged,
  onSyncTrendyol,
}: {
  board: PanelBoard | null;
  summary: PanelSummary | null;
  cash: CourierCashState | null;
  live: boolean;
  onChanged: () => void;
  onSyncTrendyol: () => Promise<void>;
}) {
  const now = useNow();
  const [channel, setChannel] = useState<Channel>("all");
  const [tab, setTab] = useState<MobileTab>("waiting");
  const [syncing, setSyncing] = useState(false);

  const target = summary?.deliveryTargetMin ?? DEFAULT_TARGET;
  const couriers = summary?.couriers ?? [];

  const all = useMemo<Order[]>(() => {
    if (!board) return [];
    return [...board.orders, ...board.trendyolOrders]
      .filter((o) => o.status === "pending" || o.status === "preparing" || o.status === "on-the-way")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // en eski üstte
  }, [board]);

  const filtered = all.filter((o) =>
    channel === "all" ? true : channel === "trendyol" ? o.source === "trendyol" : o.source !== "trendyol",
  );
  const waiting = filtered.filter((o) => !o.courier && o.status !== "on-the-way");
  const assigned = filtered.filter((o) => o.courier || o.status === "on-the-way");
  const lateCount = all.filter((o) => ageTone(ageMinutes(o, now), target) === "late").length;
  const tyCount = all.filter((o) => o.source === "trendyol").length;

  const syncTrendyol = async () => {
    setSyncing(true);
    try {
      await onSyncTrendyol();
    } finally {
      setSyncing(false);
    }
  };

  const nowDate = new Date(now);
  const mounted = now > 0; // bkz. useNow — saat/tarih yalnız tarayıcıda
  const loading = board === null || !mounted;
  const { sound, toggleSound, isNew } = useNewOrderAlert(board ? all : null);
  const fullscreen = useFullscreen();

  const card = (o: Order) => (
    <PanelOrderCard
      key={o.id}
      order={o}
      now={now}
      target={target}
      couriers={couriers}
      isNew={isNew(o.id, now)}
      onChanged={onChanged}
    />
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden px-3 pb-3 pt-3 md:px-4 lg:px-6 lg:pb-5 lg:pt-4">
      {/* ── Başlık ─────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Panel</h1>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span
              className={cn("inline-flex shrink-0 items-center gap-1 font-medium", live ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600")}
              title={live ? "Canlı — değişiklikler anında gelir" : "Sunucuya ulaşılamıyor, son veri gösteriliyor"}
            >
              <span className={cn("size-1.5 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-rose-500")} />
              {live ? "Canlı" : "Bağlantı yok"}
            </span>
            {mounted && (
              <>
                ·
                <span className="truncate">
                  {nowDate.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
                  {nowDate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-10 shrink-0 lg:size-9"
          onClick={toggleSound}
          title={sound ? "Yeni sipariş sesi açık — kapat" : "Yeni sipariş sesi kapalı — aç"}
          aria-label={sound ? "Sesi kapat" : "Sesi aç"}
        >
          {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-muted-foreground" />}
        </Button>
        {fullscreen.supported && (
          <Button
            variant="outline"
            size="icon"
            className="hidden size-9 shrink-0 lg:inline-flex"
            onClick={fullscreen.toggle}
            title={fullscreen.active ? "Tam ekrandan çık" : "Tam ekran (dükkân ekranı için)"}
            aria-label="Tam ekran"
          >
            {fullscreen.active ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-10 min-w-10 shrink-0 lg:h-9" onClick={() => void syncTrendyol()} disabled={syncing} title="Trendyol’u çek">
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          <span className="hidden sm:inline">Trendyol’u çek</span>
        </Button>
        <Button asChild size="sm" className="h-10 shrink-0 lg:h-9">
          <Link href="/orders/new">
            <PlusCircle className="size-4" />
            Yeni Sipariş
          </Link>
        </Button>
      </header>

      {/* ── Günün sayıları ─────────────────────────────────────── */}
      <PanelStats s={summary} cash={cash} now={now} />

      {/* ── Mobil sekmeler ─────────────────────────────────────── */}
      {/* Telefonda 3 sekme; tablette (ve menü açık 1024px’te) iki sipariş sütunu yan
          yana sığdığı için 2 sekme. Üç sütunlu masaüstü düzeni xl’den itibaren. */}
      <div className="grid shrink-0 grid-cols-3 rounded-lg bg-muted p-1 md:grid-cols-2 xl:hidden">
        <TabBtn className="md:hidden" active={tab === "waiting"} onClick={() => setTab("waiting")} label="Bekleyen" count={waiting.length} />
        <TabBtn className="md:hidden" active={tab === "assigned"} onClick={() => setTab("assigned")} label="Kuryede" count={assigned.length} />
        <TabBtn className="hidden md:flex" active={tab !== "couriers"} onClick={() => setTab("waiting")} label="Siparişler" count={all.length} />
        <TabBtn active={tab === "couriers"} onClick={() => setTab("couriers")} label="Kuryeler" />
      </div>

      {/* ── Ana alan ───────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-rows-1 gap-3 xl:grid-cols-12">
        {/* Sipariş panosu */}
        <section
          className={cn(
            "min-h-0 flex-col overflow-hidden rounded-xl border bg-card xl:col-span-8 xl:flex",
            tab === "couriers" ? "hidden" : "flex",
          )}
        >
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 lg:px-4">
            <h2 className="hidden text-sm font-semibold sm:block">Aktif siparişler</h2>
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">{all.length}</span>
            {lateCount > 0 && (
              <span className="whitespace-nowrap rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                {lateCount} gecikmede
              </span>
            )}
            <div className="ml-auto flex rounded-md bg-muted p-0.5 text-xs">
              {(
                [
                  ["all", "Hepsi"],
                  ["manual", "Telefon"],
                  ["trendyol", `Trendyol${tyCount ? ` ${tyCount}` : ""}`],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChannel(k)}
                  className={cn(
                    "whitespace-nowrap rounded px-2.5 py-1.5 font-medium transition-colors lg:px-2 lg:py-1",
                    channel === k ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-1 md:grid-cols-2 md:divide-x">
            <Lane
              title="Kurye bekliyor"
              hint="Kurye atanmamış"
              orders={waiting}
              loading={loading}
              className={tab === "waiting" ? "flex" : "hidden md:flex"}
              render={card}
            />
            <Lane
              title="Kuryede"
              hint="Yolda / üstlenilmiş"
              orders={assigned}
              loading={loading}
              className={tab === "assigned" ? "flex" : "hidden md:flex"}
              render={card}
            />
          </div>
        </section>

        {/* Sağ kolon: kuryeler + saatlik sipariş */}
        <aside className={cn("min-h-0 flex-col gap-3 xl:col-span-4 xl:flex", tab === "couriers" ? "flex" : "hidden")}>
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
              <h2 className="text-sm font-semibold">Kuryeler</h2>
              <span className="text-xs text-muted-foreground">dokun → parayı teslim al</span>
            </div>
            {board === null && cash === null ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <CourierPanel couriers={couriers} orders={all} cash={cash} now={now} onChanged={onChanged} />
            )}
          </section>
          <section className="h-40 shrink-0 overflow-hidden rounded-xl border bg-card lg:h-44 xl:h-52">
            {summary && mounted ? (
              <HourlyBars s={summary} nowHour={nowDate.getHours()} />
            ) : (
              <div className="h-full p-4">
                <Skeleton className="size-full" />
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Lane({
  title,
  hint,
  orders,
  loading,
  className,
  render,
}: {
  title: string;
  hint: string;
  orders: Order[];
  loading: boolean;
  className?: string;
  render: (o: Order) => React.ReactNode;
}) {
  return (
    <div className={cn("min-h-0 flex-col", className)}>
      <div className="hidden shrink-0 items-baseline gap-2 px-4 pb-1 pt-2.5 md:flex">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <span className="text-xs font-semibold tabular-nums">{orders.length}</span>
        <span className="ml-auto text-xs text-muted-foreground/70">{hint}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 md:pt-1.5 lg:px-4">
        {loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : orders.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Inbox className="size-7 opacity-30" />
            Sipariş yok
          </div>
        ) : (
          orders.map(render)
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  count,
  className,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
        active ? "bg-background shadow-xs" : "text-muted-foreground",
        className,
      )}
    >
      {label}
      {count !== undefined && <span className="tabular-nums text-muted-foreground">{count}</span>}
    </button>
  );
}

// Tarayıcı tam ekranı — panel dükkândaki ekranda sürekli açık dursun diye.
function useFullscreen() {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const update = () => setActive(!!document.fullscreenElement);
    queueMicrotask(() => setSupported(!!document.documentElement.requestFullscreen));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  return { active, supported, toggle };
}
