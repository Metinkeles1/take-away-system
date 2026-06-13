"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Plus,
  RefreshCw,
  LayoutDashboard,
  TrendingUp,
  Wallet,
  UtensilsCrossed,
  Store,
} from "lucide-react";

import {
  getChannelBreakdown,
  getDashboardStats,
  getDaySales,
  type ChannelBreakdown,
  type DashboardSource,
  type DashboardStats,
  type DaySales,
} from "@/actions/dashboard";
import { Button } from "@/components/ui/button";
import { SourceFilter } from "@/components/dashboard/SourceFilter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dayLabelTR } from "@/lib/datetime";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DayNavigator } from "@/components/dashboard/DayNavigator";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { RevenueBreakdown } from "@/components/dashboard/RevenueBreakdown";
import { SalesPerformance } from "@/components/dashboard/SalesPerformance";
import { SectionCards } from "@/components/dashboard/SectionCards";
import { HourlyTraffic } from "@/components/dashboard/HourlyTraffic";
import { TopProductsList } from "@/components/dashboard/TopProductsList";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { PaymentsTab } from "@/components/dashboard/PaymentsTab";
import { ChannelsTab } from "@/components/dashboard/ChannelsTab";

// Recharts içeren müşteri sekmesi — bundle'ı düşürmek için lazy.
const CustomerInsights = dynamic(
  () =>
    import("@/components/dashboard/CustomerInsights").then((m) => ({
      default: m.CustomerInsights,
    })),
  { ssr: false, loading: () => <Skeleton className="h-80 w-full rounded-xl" /> },
);

// ─── Kaynak (kanal) filtresi ────────────────────────────────────────────────
const VALID_SOURCES: DashboardSource[] = [
  "all",
  "manual",
  "trendyol",
  "getir",
  "yemeksepeti",
];

function parseSource(value: string | null): DashboardSource {
  return value && (VALID_SOURCES as string[]).includes(value)
    ? (value as DashboardSource)
    : "all";
}

// ─── Sekmeler ────────────────────────────────────────────────────────────────
type Tab = "ozet" | "satis" | "tahsilat" | "urun" | "kanal";

const TABS: {
  id: Tab;
  label: string;
  icon: React.ElementType;
  activeColor: string;
}[] = [
  { id: "ozet", label: "Özet", icon: LayoutDashboard, activeColor: "text-blue-600" },
  { id: "satis", label: "Satışlar", icon: TrendingUp, activeColor: "text-emerald-600" },
  { id: "tahsilat", label: "Tahsilat", icon: Wallet, activeColor: "text-orange-600" },
  { id: "urun", label: "Ürünler", icon: UtensilsCrossed, activeColor: "text-violet-600" },
  { id: "kanal", label: "Kanallar", icon: Store, activeColor: "text-cyan-600" },
];

// Bu sekmeler seçili güne duyarlı → gün gezgini gösterilir.
const DAY_DRIVEN: Tab[] = ["satis", "tahsilat", "kanal"];

function parseTab(value: string | null): Tab {
  return value && TABS.some((t) => t.id === value) ? (value as Tab) : "ozet";
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = parseSource(searchParams.get("source"));
  const tab = parseTab(searchParams.get("tab"));

  const [offset, setOffset] = useState(0);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [daySales, setDaySales] = useState<DaySales | null>(null);
  const [channels, setChannels] = useState<ChannelBreakdown | null>(null);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasDataRef = useRef(false);

  // Genel istatistik — sadece kaynağa bağlı (gün bağımsız).
  const loadStats = useCallback(async () => {
    const data = await getDashboardStats(source);
    setStats(data);
  }, [source]);

  // Güne bağlı veriler — kaynak + offset.
  const loadDay = useCallback(async () => {
    const [day, ch] = await Promise.all([
      getDaySales(source, offset),
      getChannelBreakdown(offset),
    ]);
    setDaySales(day);
    setChannels(ch);
  }, [source, offset]);

  const loadAll = useCallback(async () => {
    if (hasDataRef.current) setIsRefreshing(true);
    else setIsInitialLoading(true);
    try {
      await Promise.all([loadStats(), loadDay()]);
      hasDataRef.current = true;
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [loadStats, loadDay]);

  useEffect(() => {
    loadAll();
    const onFocus = () => loadAll();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadAll]);

  useEffect(() => {
    document.title = "İşletme Paneli · Paket Sipariş";
  }, []);

  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "ozet") params.delete("tab");
      else params.set("tab", next);
      const query = params.toString();
      router.replace(`/dashboard${query ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const isLoading = isInitialLoading;
  const showDayNav = DAY_DRIVEN.includes(tab);
  const dayLabel = daySales
    ? dayLabelTR(daySales.dateISO, offset)
    : offset === 0
      ? "Bugün"
      : offset === 1
        ? "Dün"
        : "Seçili gün";

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-1 flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:p-8">
        {/* Header + global filtre */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              İşletme Paneli
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {showDayNav
                ? "Gün ve kanal filtresi bu sekmeyi sürer"
                : "İşletme performansını ve anahtar metrikleri canlı izleyin"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showDayNav && (
              <DayNavigator
                offset={offset}
                dateISO={daySales?.dateISO ?? null}
                onOffsetChange={setOffset}
                isRefreshing={isRefreshing}
                disabled={isInitialLoading}
              />
            )}
            {tab !== "kanal" && <SourceFilter source={source} />}
            <Button
              variant="outline"
              size="sm"
              onClick={loadAll}
              disabled={isInitialLoading || isRefreshing}
              className="gap-1.5"
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  (isInitialLoading || isRefreshing) && "animate-spin",
                )}
              />
              <span className="hidden sm:inline">Yenile</span>
            </Button>
            <Button size="sm" asChild className="gap-1.5">
              <Link href="/orders/new">
                <Plus className="size-3.5" />
                Yeni Sipariş
              </Link>
            </Button>
          </div>
        </header>

        {/* Sabit KPI şeridi */}
        <SectionCards stats={stats} isLoading={isLoading} />

        {/* Sekme şeridi — segmented kontrol */}
        <div className="overflow-x-auto">
          <div className="inline-flex min-w-full items-center gap-1 rounded-xl border bg-muted/60 p-1 sm:min-w-0">
            {TABS.map((t) => {
              const active = t.id === tab;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-initial",
                    active
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", active && t.activeColor)}
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sekme içerikleri */}
        {tab === "ozet" && (
          <div className="flex flex-col gap-4">
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="flex min-w-0 lg:col-span-8">
                <SalesPerformance stats={stats} isLoading={isLoading} />
              </div>
              <div className="flex min-w-0 lg:col-span-4">
                <RevenueBreakdown stats={stats} isLoading={isLoading} />
              </div>
            </section>
            <RecentTransactions stats={stats} isLoading={isLoading} />
          </div>
        )}

        {tab === "satis" && (
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Saatlik Trafik</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <HourlyTraffic
                    hourly={(stats?.hourlyDistribution ?? []).map(
                      (h) => h.count,
                    )}
                  />
                )}
              </CardContent>
            </Card>
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TopProductsList
                stats={null}
                isLoading={isLoading}
                products={daySales?.products ?? []}
                title={`${dayLabel} Satılan Ürünler`}
                description="Adet bazlı ürün kırılımı"
                emptyText="Bu gün satış yok."
                showAction={false}
              />
              <SalesPerformance stats={stats} isLoading={isLoading} />
            </section>
          </div>
        )}

        {tab === "tahsilat" && (
          <PaymentsTab data={daySales} isLoading={isLoading} label={dayLabel} />
        )}

        {tab === "urun" && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TopProductsList stats={stats} isLoading={isLoading} />
            <CategoryBreakdown stats={stats} isLoading={isLoading} />
          </section>
        )}

        {tab === "kanal" && (
          <ChannelsTab data={channels} isLoading={isLoading} label={dayLabel} />
        )}

        {/* Müşteri analizi — her sekmenin altında ortak */}
        {(tab === "ozet" || tab === "urun") && (
          <CustomerInsights stats={stats} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
}
