"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";

import {
  getDashboardStats,
  type DashboardSource,
  type DashboardStats,
} from "@/actions/dashboard";
import { Button } from "@/components/ui/button";
import { SourceFilter } from "@/components/dashboard/SourceFilter";
import { cn } from "@/lib/utils";

import { CustomerInsights } from "./_components/CustomerInsights";
import { RecentTransactions } from "./_components/RecentTransactions";
import { RevenueBreakdown } from "./_components/RevenueBreakdown";
import { SalesPerformance } from "./_components/SalesPerformance";
import { SectionCards } from "./_components/SectionCards";
import { TopProductsList } from "./_components/TopProductsList";

const VALID_SOURCES: DashboardSource[] = [
  "all",
  "manual",
  "trendyol",
  "getir",
  "yemeksepeti",
];

const SOURCE_TITLE: Record<DashboardSource, string> = {
  all: "İşletme Paneli",
  manual: "İşletme Paneli · Manuel",
  trendyol: "İşletme Paneli · Trendyol",
  getir: "İşletme Paneli · Getir",
  yemeksepeti: "İşletme Paneli · Yemeksepeti",
};

function parseSource(value: string | null): DashboardSource {
  return value && (VALID_SOURCES as string[]).includes(value)
    ? (value as DashboardSource)
    : "all";
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const source = parseSource(searchParams.get("source"));

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasDataRef = useRef(false);

  const loadStats = useCallback(async () => {
    // İlk yüklemede skeleton; sonraki refetch'lerde sadece spinner — eski veri ekranda kalır.
    if (hasDataRef.current) setIsRefreshing(true);
    else setIsInitialLoading(true);
    try {
      const data = await getDashboardStats(source);
      setStats(data);
      hasDataRef.current = true;
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [source]);

  useEffect(() => {
    // Source değişince veriyi sıfırlamak gerekmez; eski veri durur, yeni gelir.
    loadStats();
    const onFocus = () => loadStats();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadStats]);

  const isLoading = isInitialLoading;

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {SOURCE_TITLE[source]}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              İşletme performansını ve anahtar metrikleri canlı izleyin
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SourceFilter source={source} />
            <Button
              variant="outline"
              size="sm"
              onClick={loadStats}
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

        {/* Row 1 — 4 KPI cards */}
        <SectionCards stats={stats} isLoading={isLoading} />

        {/* Row 2 — Sales chart (2/3) + Revenue donut (1/3) */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8 flex">
            <SalesPerformance stats={stats} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-4 flex">
            <RevenueBreakdown stats={stats} isLoading={isLoading} />
          </div>
        </section>

        {/* Row 3 — Recent transactions + Top products */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecentTransactions stats={stats} isLoading={isLoading} />
          <TopProductsList stats={stats} isLoading={isLoading} />
        </section>

        {/* Row 4 — Customer insights tabs */}
        <CustomerInsights stats={stats} isLoading={isLoading} />
      </div>
    </div>
  );
}
