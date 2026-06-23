"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Bike,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  MapPin,
  Plus,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import {
  getKomutaOverview,
  type KomutaOverview,
  type KomutaRegionRow,
  type KomutaCustomerRow,
} from "@/actions/komutaOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import {
  getDashboardInsights,
  type DashboardInsights,
} from "@/actions/dashboardInsights";
import { getMonthlyTarget } from "@/actions/settings";
import { type OrderSource } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatCurrencyShort } from "@/lib/utils";

import {
  OverviewRankList,
  type RankItem,
} from "@/components/dashboard/overview/OverviewRankList";
import { KomutaMetricCard } from "@/components/dashboard/komuta/KomutaMetricCard";
import { KomutaRecentOrders } from "@/components/dashboard/komuta/KomutaRecentOrders";
import { KomutaTrendChart } from "@/components/dashboard/komuta/KomutaTrendChart";
import {
  KomutaRankList,
  type KomutaRankItem,
} from "@/components/dashboard/komuta/KomutaRankList";
import {
  ChannelSplitSheet,
  type ChannelSplitData,
} from "@/components/dashboard/komuta/ChannelSplitSheet";
import { KomutaOrdersDialog } from "@/components/dashboard/komuta/KomutaOrdersDialog";
import { OverviewRegionMap } from "@/components/dashboard/overview/OverviewRegionMap";
import { InsightStat } from "@/components/dashboard/overview/InsightStat";
import { KomutaOperationsPanel } from "@/components/dashboard/komuta/KomutaOperationsPanel";
import { KomutaCustomersPanel } from "@/components/dashboard/komuta/KomutaCustomersPanel";
import { Card, CardContent } from "@/components/ui/card";

// Aşama 2 — mevcut sayfa/bileşenler sekmelerin içine gömülüyor (route'lar duruyor).
import EndOfDayPage from "@/app/gun-sonu/page";
import TrendyolSalesPage from "@/app/dashboard/trendyol/sales/page";
import { OverviewTab } from "@/components/dashboard/trendyol/OverviewTab";
import { MenuTab } from "@/components/dashboard/trendyol/MenuTab";
import { CategoriesTab } from "@/components/dashboard/trendyol/CategoriesTab";
import { RegionsTab } from "@/components/dashboard/trendyol/RegionsTab";
import { ReviewsTab } from "@/components/dashboard/trendyol/ReviewsTab";
import { PromotionsTab } from "@/components/dashboard/trendyol/PromotionsTab";
import { AllCustomersTab } from "@/components/dashboard/trendyol/AllCustomersTab";

// ─── Kanal (kaynak) filtresi — birleştirmenin kalbi ─────────────────────────
// "all" = Hepsi · "manual" = Kendi (paket/elle) · "trendyol" = Trendyol.
// Mevcut action'lar üçünü de destekliyor (source: OrderSource | "all").
type Channel = OrderSource | "all";
const CHANNELS: { id: Channel; label: string }[] = [
  { id: "all", label: "Hepsi" },
  { id: "manual", label: "Kendi" },
  { id: "trendyol", label: "Trendyol" },
];

const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: "day", label: "Gün" },
  { id: "week", label: "Bu Hafta" },
  { id: "month", label: "Bu Ay" },
];

function periodLabel(period: DashboardPeriod, offset: number): string {
  if (period === "day") {
    if (offset === 0) return "Bugün";
    if (offset === 1) return "Dün";
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toLocaleDateString("tr-TR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  if (period === "week") {
    if (offset === 0) return "Bu Hafta";
    if (offset === 1) return "Geçen Hafta";
    return `${offset} hafta önce`;
  }
  if (offset === 0) return "Bu Ay";
  if (offset === 1) return "Geçen Ay";
  return `${offset} ay önce`;
}

const MAX_OFFSET: Record<DashboardPeriod, number> = {
  day: 365,
  week: 52,
  month: 24,
};

// Sayfa-içi sekmeler. Genel Bakış/Operasyon/Müşteri canlı; Para & Gün Sonu ve
// Trendyol Detay bir sonraki adımda mevcut sayfalardan taşınacak (şimdilik köprü).
type KomutaView = "ozet" | "operasyon" | "musteri" | "finans" | "trendyol";
const VIEWS: { id: KomutaView; label: string; icon: React.ElementType; color: string }[] = [
  { id: "ozet", label: "Genel Bakış", icon: LayoutDashboard, color: "text-blue-600 dark:text-blue-400" },
  { id: "operasyon", label: "Operasyon", icon: Bike, color: "text-lime-600 dark:text-lime-400" },
  { id: "musteri", label: "Müşteri", icon: Users, color: "text-pink-600 dark:text-pink-400" },
  { id: "finans", label: "Para & Gün Sonu", icon: Wallet, color: "text-emerald-600 dark:text-emerald-400" },
  { id: "trendyol", label: "Trendyol Detay", icon: Store, color: "text-orange-600 dark:text-orange-400" },
];

// Trendyol Detay iç alt-sekmeleri — mevcut Trendyol bileşenleri.
type TyView =
  | "overview"
  | "sales"
  | "customers"
  | "regions"
  | "menu"
  | "categories"
  | "reviews"
  | "promotions";
const TY_VIEWS: { id: TyView; label: string }[] = [
  { id: "overview", label: "Genel Bakış" },
  { id: "sales", label: "Satış Analitiği" },
  { id: "customers", label: "Müşteri" },
  { id: "regions", label: "Bölgeler" },
  { id: "menu", label: "Menü" },
  { id: "categories", label: "Kategoriler" },
  { id: "reviews", label: "Değerlendirmeler" },
  { id: "promotions", label: "Kampanyalar" },
];

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

// Komuta "Gün" döneminde seçili günün ISO tarihi (Istanbul) — gün-sonu'na geçilir.
function komutaDayISO(dayOffset: number): string {
  const ist = new Date(Date.now() + 3 * 60 * 60 * 1000 - dayOffset * 24 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(
    ist.getUTCDate(),
  ).padStart(2, "0")}`;
}

export default function KomutaPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("day");
  const [dayOffset, setDayOffset] = useState(0);
  const [view, setView] = useState<KomutaView>("ozet");
  const [tyView, setTyView] = useState<TyView>("overview");
  const [channel, setChannel] = useState<Channel>("all");

  const [ordersOpen, setOrdersOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const [data, setData] = useState<KomutaOverview | null>(null);
  const [split, setSplit] = useState<ChannelSplitData | null>(null);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [target, setTarget] = useState(0);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    if (hasDataRef.current) setIsRefreshing(true);
    else setIsInitialLoading(true);
    try {
      const [overview, ins, tgt] = await Promise.all([
        getKomutaOverview(period, channel, dayOffset),
        getDashboardInsights(period, channel, dayOffset),
        getMonthlyTarget(),
      ]);
      setData(overview);
      setInsights(ins);
      setTarget(tgt);
      hasDataRef.current = true;
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [period, channel, dayOffset]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    document.title = "Komuta Merkezi · Paket Sipariş";
  }, []);

  const isLoading = isInitialLoading;
  const cur = data?.current;
  const prev = data?.previous;

  // Canlı operasyon yalnız "bugün" anlamlı.
  const showLive = period === "day" && dayOffset === 0;
  const label = periodLabel(period, dayOffset);

  const compareLabel =
    period === "day"
      ? dayOffset === 0
        ? "düne göre"
        : "önceki güne göre"
      : period === "week"
        ? dayOffset === 0
          ? "geçen haftaya göre"
          : "önceki haftaya göre"
        : dayOffset === 0
          ? "geçen aya göre"
          : "önceki aya göre";

  const trendDesc =
    period === "day"
      ? `${label} · saat saat ciro`
      : channel === "trendyol"
        ? `${label} · saat dağılımı (Trendyol günlük veri vermez)`
        : channel === "all"
          ? `${label} · gün gün ciro (Trendyol günlük dökümü hariç)`
          : `${label} · gün gün ciro`;
  const subtitle = `${label} · ${CHANNELS.find((c) => c.id === channel)?.label}`;

  // ─── Kanal kırılımı çipleri — Kendi (mavi) + Trendyol (turuncu, ikonlu) ──────
  // Yalnız "Hepsi" seçiliyken ve iki kanalda da değer varken anlamlı.
  const bd = data?.breakdown;
  const showChips = channel === "all" && !!bd;

  const channelChips = (ownVal: number, tyVal: number, fmt: (n: number) => string) =>
    showChips && (ownVal > 0 || tyVal > 0) ? (
      <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
          Kendi {fmt(ownVal)}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
          <Store className="size-3" />
          {fmt(tyVal)}
        </span>
      </div>
    ) : undefined;

  const fmtInt = (n: number) => n.toLocaleString("tr-TR");
  const revenueChips = channelChips(bd?.own.revenue ?? 0, bd?.trendyol.revenue ?? 0, formatCurrencyShort);
  const netChips = channelChips(bd?.own.net ?? 0, bd?.trendyol.net ?? 0, formatCurrencyShort);
  const orderChips = channelChips(bd?.own.orderCount ?? 0, bd?.trendyol.orderCount ?? 0, fmtInt);

  // ─── Sıralı listeler (kanal kırılımlı — iki renkli çubuk) ────
  const splitProducts = data?.splitProducts ?? [];
  const splitPayments = data?.splitPayments ?? [];
  const showLegend = channel === "all";

  const maxProductQty = Math.max(1, ...splitProducts.map((p) => p.quantity));
  const productItems: KomutaRankItem[] = splitProducts.map((p) => ({
    id: p.name,
    label: p.name,
    primary: `${p.quantity} adet · ${formatCurrencyShort(p.revenue)}`,
    ownShare: (p.own.quantity / maxProductQty) * 100,
    tyShare: (p.trendyol.quantity / maxProductQty) * 100,
  }));

  const maxPayAmount = Math.max(1, ...splitPayments.map((p) => p.amount));
  const paymentTotal = Math.max(1, splitPayments.reduce((s, p) => s + p.amount, 0));
  const paymentItems: KomutaRankItem[] = splitPayments.map((p) => ({
    id: p.key,
    label: p.label,
    primary: `${formatCurrencyShort(p.amount)} · %${Math.round((p.amount / paymentTotal) * 100)}`,
    ownShare: (p.own / maxPayAmount) * 100,
    tyShare: (p.trendyol / maxPayAmount) * 100,
  }));

  // Satıra tıkla → kanal kırılımı yan panel ("kimde ne kadar").
  const openProductSplit = (name: string) => {
    const p = splitProducts.find((x) => x.name === name);
    if (!p) return;
    setSplit({
      title: p.name,
      subtitle: `${p.quantity} adet · ${formatCurrencyShort(p.revenue)} · ${label}`,
      own: { value: `${p.own.quantity} adet · ${formatCurrencyShort(p.own.revenue)}`, raw: p.own.quantity },
      trendyol: {
        value: `${p.trendyol.quantity} adet · ${formatCurrencyShort(p.trendyol.revenue)}`,
        raw: p.trendyol.quantity,
      },
      ordersQuery: { period, channel, dayOffset, productName: p.name },
    });
  };
  const openPaymentSplit = (key: string) => {
    const p = splitPayments.find((x) => x.key === key);
    if (!p) return;
    const brands =
      key === "meal_card"
        ? (data?.mealCardBrands ?? []).map((b) => ({
            label: b.label,
            amount: formatCurrencyShort(b.amount),
            own: b.own,
            trendyol: b.trendyol,
          }))
        : undefined;
    setSplit({
      title: p.label,
      subtitle: `${formatCurrencyShort(p.amount)} · ${label}`,
      own: { value: formatCurrencyShort(p.own), raw: p.own },
      trendyol: { value: formatCurrencyShort(p.trendyol), raw: p.trendyol },
      brands,
      ordersQuery: { period, channel, dayOffset, method: p.key },
    });
  };
  // Bölge satırına tıkla → kanal kırılımı + o bölgenin siparişleri.
  const openRegionSplit = (r: KomutaRegionRow) => {
    setSplit({
      title: r.name,
      subtitle: `${r.total} sipariş · ${label}`,
      own: { value: `${r.own} sip`, raw: r.own },
      trendyol: { value: `${r.trendyol} sip`, raw: r.trendyol },
      ordersQuery: { period, channel, dayOffset, district: r.name },
    });
  };
  // Müşteriye tıkla → kanal başına harcama + sipariş geçmişi.
  const openCustomerSplit = (c: KomutaCustomerRow) => {
    setSplit({
      title: c.name && c.name !== "—" ? c.name : c.phone ?? "Trendyol müşterisi",
      subtitle: `${formatCurrencyShort(c.total)} · ${c.own.orders + c.trendyol.orders} sipariş · ${label}`,
      own: { value: `${c.own.orders} sip · ${formatCurrencyShort(c.own.revenue)}`, raw: c.own.revenue },
      trendyol: {
        value: `${c.trendyol.orders} sip · ${formatCurrencyShort(c.trendyol.revenue)}`,
        raw: c.trendyol.revenue,
      },
      ordersQuery: {
        period,
        channel,
        dayOffset,
        phone: c.phone ?? undefined,
        trendyolId: c.trendyolId ?? undefined,
      },
    });
  };

  const maxCourier = Math.max(1, ...(insights?.couriers ?? []).map((c) => c.deliveries));
  const courierItems: RankItem[] = (insights?.couriers ?? []).map((c) => ({
    id: c.name,
    label: c.name,
    primary: `${c.deliveries} teslimat`,
    secondary: `${c.avgMin != null ? `${c.avgMin} dk · ` : ""}${formatCurrencyShort(c.amount)}`,
    share: (c.deliveries / maxCourier) * 100,
    color: "bg-blue-500",
  }));

  const cancelTrend =
    insights && insights.cancel.prevRate != null
      ? insights.cancel.rate - insights.cancel.prevRate
      : null;

  // Operasyon — Trendyol sipariş/teslim/iptal sayılarını kat (kurye/süre yok).
  const tyOps = data?.trendyolOps;
  const tyOpsIncluded = (channel === "all" || channel === "trendyol") && !!tyOps?.available;
  const ownDelivered = insights?.delivery.delivered ?? 0;
  const deliveredTotal = ownDelivered + (tyOpsIncluded ? tyOps!.delivered : 0);
  const tyOnly = channel === "trendyol";
  const tyCancelRate =
    tyOps && tyOps.orderCount + tyOps.cancelled > 0
      ? (tyOps.cancelled / (tyOps.orderCount + tyOps.cancelled)) * 100
      : 0;

  const showTarget = period === "month" && dayOffset === 0 && target > 0;
  const targetPct = showTarget && cur ? Math.min(100, (cur.revenue / target) * 100) : 0;

  const openAllOrders = () => setOrdersOpen(true);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        {/* ─── Başlık + kontroller ─────────────────────────────── */}
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Komuta Merkezi</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Kanal seçici */}
            <div className="inline-flex rounded-lg border bg-muted/60 p-1">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    channel === c.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Dönem seçici */}
            <div className="inline-flex rounded-lg border bg-muted/60 p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPeriod(p.id);
                    setDayOffset(0);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    period === p.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Gezgin */}
            <div className="inline-flex items-center rounded-lg border bg-background">
              <button
                type="button"
                onClick={() => setDayOffset((o) => Math.min(MAX_OFFSET[period], o + 1))}
                className="flex size-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Önceki dönem"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-24 px-2 text-center text-sm font-medium">{label}</span>
              <button
                type="button"
                onClick={() => setDayOffset((o) => Math.max(0, o - 1))}
                disabled={dayOffset === 0}
                className="flex size-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Sonraki dönem"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setMapOpen(true)} className="gap-1.5">
              <MapPin className="size-3.5" />
              <span className="hidden sm:inline">Harita</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={isInitialLoading || isRefreshing}
              className="gap-1.5"
            >
              <RefreshCw className={cn("size-3.5", (isInitialLoading || isRefreshing) && "animate-spin")} />
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

        {/* ─── Sayfa-içi sekmeler (segmented control — net tıklanabilir) ─── */}
        <div className="overflow-x-auto rounded-xl border bg-muted/50 p-1 shadow-inner">
          <div className="flex min-w-max gap-1 sm:min-w-full">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-all",
                    active
                      ? "bg-background font-semibold text-foreground shadow-sm ring-1 ring-border"
                      : "font-medium text-muted-foreground hover:bg-background/70 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", active ? v.color : "text-muted-foreground/70")}
                  />
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ════════ GENEL BAKIŞ ════════ */}
        {view === "ozet" && (
          <>
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KomutaMetricCard
                label="Ciro"
                icon={TrendingUp}
                value={formatCurrencyShort(cur?.revenue ?? 0)}
                delta={cur && prev ? pct(cur.revenue, prev.revenue) : null}
                comparisonLabel={compareLabel}
                isLoading={isLoading}
                onClick={openAllOrders}
                chips={revenueChips}
              />
              <KomutaMetricCard
                label="Net (Cebe Giren)"
                icon={Banknote}
                value={formatCurrencyShort(cur?.net ?? 0)}
                delta={cur && prev ? pct(cur.net, prev.net) : null}
                comparisonLabel={compareLabel}
                accent
                isLoading={isLoading}
                onClick={openAllOrders}
                chips={netChips}
              />
              <KomutaMetricCard
                label="Sipariş"
                icon={ShoppingBag}
                value={(cur?.orderCount ?? 0).toLocaleString("tr-TR")}
                delta={cur && prev ? pct(cur.orderCount, prev.orderCount) : null}
                comparisonLabel={compareLabel}
                isLoading={isLoading}
                onClick={openAllOrders}
                chips={orderChips}
              />
              <KomutaMetricCard
                label="Ortalama Sepet"
                icon={Wallet}
                value={formatCurrencyShort(cur?.avgBasket ?? 0)}
                delta={cur && prev ? pct(cur.avgBasket, prev.avgBasket) : null}
                comparisonLabel={compareLabel}
                isLoading={isLoading}
                onClick={openAllOrders}
              />
            </section>

            {showTarget && cur && (
              <Card>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-baseline justify-between text-sm">
                    <span className="font-medium">Aylık Hedef</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrencyShort(cur.revenue)} / {formatCurrencyShort(target)}
                      <span className="ml-2 font-semibold text-foreground">
                        %{targetPct.toFixed(0)}
                      </span>
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        targetPct >= 100 ? "bg-emerald-500" : "bg-primary",
                      )}
                      style={{ width: `${Math.max(targetPct, 2)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
              <div className={cn("h-full", showLive ? "lg:col-span-2" : "lg:col-span-3")}>
                <KomutaTrendChart
                  data={data?.splitTrend ?? []}
                  title="Ciro Trendi"
                  description={trendDesc}
                  isLoading={isLoading}
                />
              </div>
              {showLive && (
                <KomutaRecentOrders period={period} channel={channel} dayOffset={dayOffset} />
              )}
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <KomutaRankList
                title="En Çok Satan Ürünler"
                items={productItems}
                isLoading={isLoading}
                emptyText="Bu dönemde satış yok."
                showLegend={showLegend}
                hint="Satıra tıkla → kendi/Trendyol kırılımı"
                onItemClick={openProductSplit}
              />
              <KomutaRankList
                title="Nasıl Ödendi"
                items={paymentItems}
                isLoading={isLoading}
                emptyText="Tahsilat verisi yok."
                showLegend={showLegend}
                hint="Satıra tıkla → kendi/Trendyol kırılımı"
                onItemClick={openPaymentSplit}
              />
            </section>
          </>
        )}

        {/* ════════ OPERASYON — Trendyol kanalı (DB insight'ı boş, TY sayıları) ════════ */}
        {view === "operasyon" && tyOnly && (
          <>
            <SectionTitle>Trendyol Teslimat</SectionTitle>
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <InsightStat
                label="Sipariş"
                value={tyOps?.available ? String(tyOps.orderCount) : "—"}
                isLoading={isLoading}
              />
              <InsightStat
                label="Teslim Edilen"
                value={tyOps?.available ? String(tyOps.delivered) : "—"}
                tone="emerald"
                isLoading={isLoading}
              />
              <InsightStat
                label="İptal"
                value={tyOps?.available ? String(tyOps.cancelled) : "—"}
                tone="rose"
                isLoading={isLoading}
              />
              <InsightStat
                label="İptal Oranı"
                value={tyOps?.available ? `%${tyCancelRate.toFixed(1)}` : "—"}
                tone={tyCancelRate > 5 ? "rose" : "default"}
                isLoading={isLoading}
              />
            </section>
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Teslim süresi ve kurye performansı yalnız sistemdeki siparişlerden ölçülür —
                Trendyol API&apos;si bunları vermiyor. Bölge ve saat yoğunluğu ise sipariş
                verisinden hesaplanır.
              </CardContent>
            </Card>
            <KomutaOperationsPanel
              period={period}
              channel={channel}
              dayOffset={dayOffset}
              showLegend={false}
              onRegionClick={openRegionSplit}
            />
          </>
        )}

        {/* ════════ OPERASYON — Kendi / Hepsi ════════ */}
        {view === "operasyon" && !tyOnly && (
          <>
            <SectionTitle>Teslimat</SectionTitle>
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <InsightStat
                label="Zamanında Teslim"
                value={insights ? `%${insights.delivery.onTimeRate.toFixed(0)}` : "—"}
                sub={insights ? `${insights.delivery.slaMin} dk altı` : undefined}
                tone={
                  insights && insights.delivery.onTimeRate >= 80
                    ? "emerald"
                    : insights && insights.delivery.onTimeRate < 50
                      ? "rose"
                      : "amber"
                }
                isLoading={isLoading}
              />
              <InsightStat
                label="Ort. Teslim Süresi"
                value={insights?.delivery.avgMin != null ? `${insights.delivery.avgMin} dk` : "—"}
                sub={
                  insights?.delivery.slowestMin != null
                    ? `en yavaş ${insights.delivery.slowestMin} dk`
                    : undefined
                }
                isLoading={isLoading}
              />
              <InsightStat
                label="İptal Oranı"
                value={insights ? `%${insights.cancel.rate.toFixed(1)}` : "—"}
                sub={
                  tyOpsIncluded
                    ? `Kendi ${insights?.cancel.cancelled ?? 0} · TY ${tyOps!.cancelled} iptal`
                    : insights
                      ? `${insights.cancel.cancelled} iptal`
                      : undefined
                }
                tone={insights && insights.cancel.rate > 5 ? "rose" : "default"}
                trend={cancelTrend}
                trendUpGood={false}
                isLoading={isLoading}
              />
              <InsightStat
                label="Teslim Edilen"
                value={insights ? String(deliveredTotal) : "—"}
                sub={
                  tyOpsIncluded
                    ? `Kendi ${ownDelivered} · TY ${tyOps!.delivered}`
                    : "süresi ölçülen"
                }
                isLoading={isLoading}
              />
            </section>
            <OverviewRankList
              title="Kurye Performansı"
              items={courierItems}
              isLoading={isLoading}
              emptyText="Bu dönemde kurye atanmış teslimat yok."
            />
            <KomutaOperationsPanel
              period={period}
              channel={channel}
              dayOffset={dayOffset}
              showLegend={channel === "all"}
              onRegionClick={openRegionSplit}
            />
          </>
        )}

        {/* ════════ MÜŞTERİ — kanal segmentleri + kohort + en değerli (kendi+TY) ════════ */}
        {view === "musteri" && (
          <KomutaCustomersPanel
            period={period}
            channel={channel}
            dayOffset={dayOffset}
            showLegend={channel === "all"}
            onCustomerClick={openCustomerSplit}
            cohorts={
              channel !== "trendyol" ? (
                <>
                  <SectionTitle>Sadakat (kendi siparişler)</SectionTitle>
                  <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
                    <InsightStat
                      label="Bu Dönem Aktif"
                      value={insights ? String(insights.cohorts.activeInPeriod) : "—"}
                      isLoading={isLoading}
                    />
                    <InsightStat
                      label="Yeni"
                      value={insights ? String(insights.cohorts.newInPeriod) : "—"}
                      tone="emerald"
                      isLoading={isLoading}
                    />
                    <InsightStat
                      label="Dönen"
                      value={insights ? String(insights.cohorts.returningInPeriod) : "—"}
                      isLoading={isLoading}
                    />
                    <InsightStat
                      label="Tekrar Oranı"
                      value={insights ? `%${insights.cohorts.repeatRate.toFixed(0)}` : "—"}
                      sub="tüm zamanlar"
                      isLoading={isLoading}
                    />
                    <InsightStat
                      label="Soğuyan"
                      value={insights ? String(insights.cohorts.atRisk) : "—"}
                      tone="amber"
                      sub="30–90 gün"
                      isLoading={isLoading}
                    />
                    <InsightStat
                      label="Kayıp"
                      value={insights ? String(insights.cohorts.lost) : "—"}
                      tone="rose"
                      sub="90+ gün"
                      isLoading={isLoading}
                    />
                  </section>
                </>
              ) : null
            }
          />
        )}

        {/* ════════ PARA & GÜN SONU ════════ */}
        {/* Mevcut Gün Sonu sayfası gömülü — Trendyol hakediş + kasa + arşiv.
            Negatif yatay margin parent padding'i nötrler (sayfa kendi padding'ini getirir). */}
        {view === "finans" && (
          <div className="-mx-4 sm:-mx-6 lg:-mx-8">
            <EndOfDayPage
              initialDate={period === "day" ? komutaDayISO(dayOffset) : undefined}
            />
          </div>
        )}

        {/* ════════ TRENDYOL DETAY ════════ */}
        {view === "trendyol" && (
          <div className="flex flex-col gap-4">
            <div className="inline-flex w-full overflow-x-auto rounded-xl border bg-muted/60 p-1">
              {TY_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setTyView(v.id)}
                  className={cn(
                    "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    tyView === v.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {tyView === "overview" && <OverviewTab />}
            {tyView === "sales" && <TrendyolSalesPage />}
            {tyView === "customers" && <AllCustomersTab />}
            {tyView === "regions" && <RegionsTab />}
            {tyView === "menu" && <MenuTab />}
            {tyView === "categories" && <CategoriesTab />}
            {tyView === "reviews" && <ReviewsTab />}
            {tyView === "promotions" && <PromotionsTab />}
          </div>
        )}
      </div>

      {/* Bölge haritası — modalda */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Siparişler Nereden Geldi</DialogTitle>
            <DialogDescription>{subtitle} · pinli sipariş konumları</DialogDescription>
          </DialogHeader>
          {mapOpen && (
            <OverviewRegionMap period={period} source={channel} dayOffset={dayOffset} />
          )}
        </DialogContent>
      </Dialog>

      {/* KPI kartı → dönem siparişleri (Kendi DB + Trendyol API birlikte) */}
      <KomutaOrdersDialog
        open={ordersOpen}
        onOpenChange={setOrdersOpen}
        title={`${subtitle} — Siparişler`}
        period={period}
        channel={channel}
        dayOffset={dayOffset}
      />

      {/* Ürün/ödeme satırı → kanal kırılımı (kendi vs Trendyol) */}
      <ChannelSplitSheet data={split} onClose={() => setSplit(null)} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
