"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getTrendyolDashboardStats,
  type TrendyolDashboardStats,
  type TrendyolPeriod,
} from "@/actions/trendyolDashboard";
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
import {
  RefreshCw,
  ArrowLeft,
  Landmark,
  ShoppingBag,
  CreditCard,
  Wallet,
  Store,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

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

export default function TrendyolGunSonuPage() {
  const [period, setPeriod] = useState<TrendyolPeriod>("today");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [todayValue, setTodayValue] = useState<string>("");
  const [stats, setStats] = useState<TrendyolDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = toDateInputValue(new Date());
    setTodayValue(t);
    setSelectedDate(t);
  }, []);

  const isToday = selectedDate === todayValue && todayValue !== "";

  const loadStats = useCallback(async () => {
    if (!selectedDate) return;
    setIsLoading(true);
    try {
      const refDate = parseDateInputValue(selectedDate).getTime();
      setStats(await getTrendyolDashboardStats(period, refDate));
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedDate]);

  useEffect(() => {
    if (selectedDate) loadStats();
  }, [loadStats, selectedDate]);

  const periodLabel = useMemo(() => {
    if (!selectedDate) return "";
    if (period === "today") {
      if (isToday) return "Bugün";
      return parseDateInputValue(selectedDate).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    if (period === "week") return isToday ? "Son 7 Gün" : "7 Günlük";
    return isToday ? "Son 30 Gün" : "30 Günlük";
  }, [period, isToday, selectedDate]);

  const e = stats?.earnings;
  const loading = isLoading && !stats;
  const withDoor = e ? e.totalBankNet + e.onDelivery.bankNet : 0;

  // Marka kırılımı (online ticket vs kapıda kod), brüt'e göre sıralı.
  const onlineTickets = useMemo(
    () =>
      (stats?.mealCardBreakdown ?? [])
        .filter((m) => m.source === "online")
        .sort((a, b) => b.revenue - a.revenue),
    [stats?.mealCardBreakdown],
  );
  const doorTickets = useMemo(
    () =>
      (stats?.mealCardBreakdown ?? [])
        .filter((m) => m.source === "on_delivery")
        .sort((a, b) => b.revenue - a.revenue),
    [stats?.mealCardBreakdown],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ── Üst bar ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <Link
            href="/dashboard/trendyol"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Genel Bakış
          </Link>
          <h2 className="text-2xl font-semibold tracking-tight">Gün Sonu Özeti</h2>
          <p className="text-sm text-muted-foreground">{periodLabel} · Trendyol</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as TrendyolPeriod)}>
            <TabsList>
              <TabsTrigger value="today" disabled={isLoading}>Bugün</TabsTrigger>
              <TabsTrigger value="week" disabled={isLoading}>7 Gün</TabsTrigger>
              <TabsTrigger value="month" disabled={isLoading}>30 Gün</TabsTrigger>
            </TabsList>
          </Tabs>
          <input
            type="date"
            value={selectedDate}
            max={todayValue}
            onChange={(ev) => setSelectedDate(ev.target.value)}
            disabled={isLoading}
            suppressHydrationWarning
            className="h-8 w-38 rounded-md border bg-background px-2.5 text-sm tabular-nums outline-none transition focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
          />
          <Button size="sm" variant="outline" onClick={loadStats} disabled={isLoading} className="h-8 gap-1.5">
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Yenile</span>
          </Button>
        </div>
      </div>

      {stats?.error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Trendyol verisine ulaşılamadı: {stats.error}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Hero: Toplam satış + Bankaya gelen ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="grid-cols-[1fr_auto] pb-2">
                <CardDescription className="text-sm font-medium">
                  Toplam Satış
                </CardDescription>
                <ShoppingBag className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-1">
                {loading ? (
                  <Skeleton className="h-10 w-36" />
                ) : (
                  <p className="text-3xl font-bold tabular-nums tracking-tight">
                    {formatCurrency(stats?.revenue ?? 0)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {stats?.orderCount ?? 0} sipariş · brüt ciro
                </p>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardHeader className="grid-cols-[1fr_auto] pb-2">
                <CardDescription className="text-sm font-medium text-emerald-700">
                  Bankaya Gelen
                </CardDescription>
                <Landmark className="size-4 text-emerald-600" />
              </CardHeader>
              <CardContent className="space-y-1">
                {loading ? (
                  <Skeleton className="h-10 w-36" />
                ) : (
                  <p className="text-3xl font-bold tabular-nums tracking-tight text-emerald-700">
                    {formatCurrency(e?.totalBankNet ?? 0)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Kart + yemek kartı · kapıda hariç
                  {e && e.onDelivery.count > 0 && (
                    <> · kapıda dahil {formatCurrency(withDoor)}</>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Kanal dağılımı ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kanal Dağılımı</CardTitle>
              <CardDescription>
                {e ? `Komisyon ~%${(e.commissionRate * 100).toFixed(1)} (online karttan)` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : e ? (
                <div className="space-y-1">
                  <ChannelRow
                    icon={CreditCard}
                    label="Kredi Kartı"
                    tag="gerçek"
                    cat={e.creditCard}
                  />

                  <ChannelRow
                    icon={Wallet}
                    label="Yemek Kartı (ticket)"
                    tag="tahmini"
                    cat={e.ticket}
                  />
                  <BrandList items={onlineTickets} />

                  {/* Toplam (kapıda hariç) */}
                  <div className="mt-2 flex items-center justify-between border-t pt-2.5">
                    <span className="text-sm font-semibold">
                      Bankaya gelen{" "}
                      <span className="font-normal text-muted-foreground">(kapıda hariç)</span>
                    </span>
                    <span className="text-lg font-bold tabular-nums text-emerald-700">
                      {formatCurrency(e.totalBankNet)}
                    </span>
                  </div>

                  {/* Kapıda — ayrı, hakedişe dahil değil */}
                  {e.onDelivery.count > 0 && (
                    <div className="mt-3 rounded-lg bg-muted/50 p-3">
                      <ChannelRow
                        icon={Store}
                        label="Kapıda Ödeme"
                        tag="işletme ciron"
                        cat={e.onDelivery}
                        muted
                      />
                      <BrandList items={doorTickets} />
                      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                        Kapıda ödemeler işletme cironuzda ayrıca sayıldığı için
                        bankaya gelen tutara dahil edilmez (mükerrer kayıt olmasın).
                        Kapıda dahil toplam:{" "}
                        <span className="font-medium tabular-nums">
                          {formatCurrency(withDoor)}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <p className="px-1 text-[11px] leading-snug text-muted-foreground">
            Kredi kartı neti Trendyol mutabakatından <b>gerçek</b>; yemek kartı ve
            kapıda <b>tahminidir</b> ((tutar − indirim) × (1 − komisyon), yemek
            kartında ayrıca sağlayıcı −%10). Komisyon oranı online kartın gerçek
            netinden türetilir.
          </p>
        </>
      )}
    </div>
  );
}

function ChannelRow({
  icon: Icon,
  label,
  tag,
  cat,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tag: string;
  cat: TrendyolDashboardStats["earnings"]["creditCard"];
  muted?: boolean;
}) {
  if (cat.count === 0) return null;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-medium ${muted ? "text-muted-foreground" : ""}`}>
            {label}
          </span>
          <span className="rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
            {tag}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {cat.count} sipariş · brüt {formatCurrency(cat.gross)}
        </p>
      </div>
      <span
        className={`shrink-0 text-base font-bold tabular-nums ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {formatCurrency(cat.bankNet)}
      </span>
    </div>
  );
}

// Marka kırılımı — hangi ticket ne kadar (brüt). Kategori satırının altında girintili.
function BrandList({
  items,
}: {
  items: TrendyolDashboardStats["mealCardBreakdown"];
}) {
  if (items.length === 0) return null;
  return (
    <ul className="ml-12 space-y-1 border-l pl-3">
      {items.map((m) => (
        <li
          key={`${m.brand}|${m.source}`}
          className="flex items-center justify-between gap-2 text-xs"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
            {m.brand}
            <span className="text-muted-foreground/60">· {m.count} sip</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {formatCurrency(m.revenue)}
          </span>
        </li>
      ))}
    </ul>
  );
}
