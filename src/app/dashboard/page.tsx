"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  getDashboardOverview,
  type DashboardOverview,
  type PaymentKey,
} from "@/actions/dashboardOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import {
  getOperationalSnapshot,
  type OperationalSnapshot,
} from "@/actions/dashboard";
import {
  getDashboardInsights,
  getOpenAccountsSummary,
  type DashboardInsights,
  type OpenAccountsSummary,
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
import { cn, formatCurrency } from "@/lib/utils";

import { OverviewMetricCard } from "@/components/dashboard/overview/OverviewMetricCard";
import { OverviewTrendChart } from "@/components/dashboard/overview/OverviewTrendChart";
import { OverviewActiveOrders } from "@/components/dashboard/overview/OverviewActiveOrders";
import {
  OverviewRankList,
  type RankItem,
} from "@/components/dashboard/overview/OverviewRankList";
import { PeriodOrdersDialog } from "@/components/dashboard/overview/PeriodOrdersDialog";
import { OverviewRegionMap } from "@/components/dashboard/overview/OverviewRegionMap";
import { InsightStat } from "@/components/dashboard/overview/InsightStat";
import { OverviewHeatmap } from "@/components/dashboard/overview/OverviewHeatmap";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ─── Dönem & kaynak seçenekleri ─────────────────────────────────────────────
const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: "day", label: "Gün" },
  { id: "week", label: "Bu Hafta" },
  { id: "month", label: "Bu Ay" },
];

// Gezgin etiketi — döneme göre. 0=güncel, 1=bir önceki …
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

// Dönem başına geri gidebileceğimiz makul üst sınır.
const MAX_OFFSET: Record<DashboardPeriod, number> = {
  day: 365,
  week: 52,
  month: 24,
};

// Sayfa-içi sekmeler — her şeyi tek ekrana yığmamak için.
type DashView = "ozet" | "operasyon" | "musteri" | "finans";
const VIEWS: { id: DashView; label: string }[] = [
  { id: "ozet", label: "Özet" },
  { id: "operasyon", label: "Operasyon" },
  { id: "musteri", label: "Müşteri" },
  { id: "finans", label: "Finans" },
];

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("day");
  const [dayOffset, setDayOffset] = useState(0);
  const [view, setView] = useState<DashView>("ozet");

  // Bu panel sadece kendi (manuel) siparişleri gösterir — Trendyol'un kendi
  // dashboard'ı ayrı, buraya karışmasın.
  const source: OrderSource = "manual";
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // Ödeme yöntemi filtresi — bir ödeme satırına tıklayınca dolu, KPI kartından
  // açılınca boş (tüm siparişler).
  const [payFilter, setPayFilter] = useState<{ key: PaymentKey; label: string } | null>(
    null,
  );

  const [data, setData] = useState<DashboardOverview | null>(null);
  const [snapshot, setSnapshot] = useState<OperationalSnapshot | null>(null);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [openAcc, setOpenAcc] = useState<OpenAccountsSummary | null>(null);
  const [target, setTarget] = useState(0);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    if (hasDataRef.current) setIsRefreshing(true);
    else setIsInitialLoading(true);
    try {
      const [overview, snap, ins, oa, tgt] = await Promise.all([
        getDashboardOverview(period, source, dayOffset),
        getOperationalSnapshot(source),
        getDashboardInsights(period, source, dayOffset),
        getOpenAccountsSummary(),
        getMonthlyTarget(),
      ]);
      setData(overview);
      setSnapshot(snap);
      setInsights(ins);
      setOpenAcc(oa);
      setTarget(tgt);
      hasDataRef.current = true;
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [period, source, dayOffset]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    document.title = "İşletme Paneli · Paket Sipariş";
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
    period === "day" ? `${label} · saat saat ciro` : `${label} · gün gün ciro`;

  const subtitle = `${label} özeti`;

  // ─── Sıralı listeler için veri hazırla ───────────────────────
  const topProductsList = (data?.topProducts ?? []).slice(0, 8);
  const maxProductQty = Math.max(1, ...topProductsList.map((p) => p.quantity));
  const productItems: RankItem[] = topProductsList.map((p) => ({
    id: p.name,
    label: p.name,
    primary: `${p.quantity} adet`,
    secondary: formatCurrency(p.revenue),
    share: (p.quantity / maxProductQty) * 100,
  }));

  const paymentTotal = Math.max(1, (data?.payments ?? []).reduce((s, p) => s + p.amount, 0));
  const paymentItems: RankItem[] = (data?.payments ?? []).map((p) => ({
    id: p.key,
    label: p.label,
    primary: formatCurrency(p.amount),
    secondary: `%${Math.round((p.amount / paymentTotal) * 100)}`,
    share: (p.amount / paymentTotal) * 100,
    color: p.key === "meal_card" ? "bg-orange-500" : "bg-primary",
  }));

  // ─── Insights türev listeleri ───────────────────────────────
  const maxCourier = Math.max(1, ...(insights?.couriers ?? []).map((c) => c.deliveries));
  const courierItems: RankItem[] = (insights?.couriers ?? []).map((c) => ({
    id: c.name,
    label: c.name,
    primary: `${c.deliveries} teslimat`,
    secondary: `${c.avgMin != null ? `${c.avgMin} dk · ` : ""}${formatCurrency(c.amount)}`,
    share: (c.deliveries / maxCourier) * 100,
    color: "bg-blue-500",
  }));

  const maxCustomerRev = Math.max(1, ...(insights?.topCustomers ?? []).map((c) => c.revenue));
  const topCustomerItems: RankItem[] = (insights?.topCustomers ?? []).map((c) => ({
    id: c.phone,
    label: c.name,
    primary: formatCurrency(c.revenue),
    secondary: `${c.orderCount} sip.`,
    share: (c.revenue / maxCustomerRev) * 100,
    color: "bg-violet-500",
  }));

  const maxDebt = Math.max(1, ...(openAcc?.topDebtors ?? []).map((d) => d.amount));
  const debtorItems: RankItem[] = (openAcc?.topDebtors ?? []).map((d) => ({
    id: d.phone,
    label: d.name,
    primary: formatCurrency(d.amount),
    secondary: `${d.orders} sip.`,
    share: (d.amount / maxDebt) * 100,
    color: "bg-rose-500",
  }));

  const cancelTrend =
    insights && insights.cancel.prevRate != null
      ? insights.cancel.rate - insights.cancel.prevRate
      : null;

  // Aylık hedef ilerleme — yalnız güncel ay görünümünde, hedef girilmişse.
  const showTarget = period === "month" && dayOffset === 0 && target > 0;
  const targetPct = showTarget && cur ? Math.min(100, (cur.revenue / target) * 100) : 0;

  // KPI kartından → tüm siparişler; ödeme satırından → o yöntemin siparişleri.
  const openAllOrders = () => {
    setPayFilter(null);
    setOrdersOpen(true);
  };
  const openPaymentOrders = (key: string) => {
    const p = (data?.payments ?? []).find((x) => x.key === key);
    setPayFilter({ key: key as PaymentKey, label: p?.label ?? "Ödeme" });
    setOrdersOpen(true);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        {/* ─── Başlık + kontroller ─────────────────────────────── */}
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">İşletme Paneli</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Dönem seçici */}
            <div className="inline-flex rounded-lg border bg-muted/60 p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPeriod(p.id);
                    setDayOffset(0); // dönem değişince güncele dön
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

            {/* Gezgin — her dönemde kalıcı (gün/hafta/ay geriye git) */}
            <div className="inline-flex items-center rounded-lg border bg-background">
              <button
                type="button"
                onClick={() =>
                  setDayOffset((o) => Math.min(MAX_OFFSET[period], o + 1))
                }
                className="flex size-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Önceki dönem"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-24 px-2 text-center text-sm font-medium">
                {label}
              </span>
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMapOpen(true)}
              className="gap-1.5"
            >
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
              <RefreshCw
                className={cn("size-3.5", (isInitialLoading || isRefreshing) && "animate-spin")}
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

        {/* ─── Sayfa-içi sekmeler ──────────────────────────────── */}
        <div className="inline-flex w-full overflow-x-auto rounded-xl border bg-muted/60 p-1 sm:w-auto">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={cn(
                "flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-initial",
                view === v.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* ════════ ÖZET ════════ */}
        {view === "ozet" && (
          <>

        {/* ─── 4 büyük metrik ──────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <OverviewMetricCard
            label="Ciro"
            icon={TrendingUp}
            value={formatCurrency(cur?.revenue ?? 0)}
            delta={cur && prev ? pct(cur.revenue, prev.revenue) : null}
            comparisonLabel={compareLabel}
            isLoading={isLoading}
            onClick={openAllOrders}
          />
          <OverviewMetricCard
            label="Net (Cebe Giren)"
            icon={Banknote}
            value={formatCurrency(cur?.net ?? 0)}
            delta={cur && prev ? pct(cur.net, prev.net) : null}
            comparisonLabel={compareLabel}
            accent
            isLoading={isLoading}
            onClick={openAllOrders}
          />
          <OverviewMetricCard
            label="Sipariş"
            icon={ShoppingBag}
            value={(cur?.orderCount ?? 0).toLocaleString("tr-TR")}
            delta={cur && prev ? pct(cur.orderCount, prev.orderCount) : null}
            comparisonLabel={compareLabel}
            isLoading={isLoading}
            onClick={openAllOrders}
          />
          <OverviewMetricCard
            label="Ortalama Sepet"
            icon={Wallet}
            value={formatCurrency(cur?.avgBasket ?? 0)}
            delta={cur && prev ? pct(cur.avgBasket, prev.avgBasket) : null}
            comparisonLabel={compareLabel}
            isLoading={isLoading}
            onClick={openAllOrders}
          />
        </section>

        {/* ─── Aylık hedef ilerleme (sadece güncel ay) ─────────── */}
        {showTarget && cur && (
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="font-medium">Aylık Hedef</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(cur.revenue)} / {formatCurrency(target)}
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

        {/* ─── Grafik + açık siparişler ────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={showLive ? "lg:col-span-2" : "lg:col-span-3"}>
            <OverviewTrendChart
              data={data?.trend ?? []}
              title="Ciro Trendi"
              description={trendDesc}
              isLoading={isLoading}
            />
          </div>
          {showLive && (
            <OverviewActiveOrders snapshot={snapshot} isLoading={isLoading} />
          )}
        </section>

        {/* ─── Ürün / ödeme ────────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <OverviewRankList
            title="En Çok Satan Ürünler"
            items={productItems}
            isLoading={isLoading}
            emptyText="Bu dönemde satış yok."
          />
          <OverviewRankList
            title="Nasıl Ödendi"
            items={paymentItems}
            isLoading={isLoading}
            emptyText="Tahsilat verisi yok."
            onItemClick={openPaymentOrders}
            hint="Bir yönteme tıkla → o siparişler (yemek kartı markası dahil)"
          />
        </section>
          </>
        )}

        {/* ════════ OPERASYON ════════ */}
        {view === "operasyon" && (
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
            sub={insights ? `${insights.cancel.cancelled} iptal` : undefined}
            tone={insights && insights.cancel.rate > 5 ? "rose" : "default"}
            trend={cancelTrend}
            trendUpGood={false}
            isLoading={isLoading}
          />
          <InsightStat
            label="Teslim Edilen"
            value={insights ? String(insights.delivery.delivered) : "—"}
            sub="süresi ölçülen"
            isLoading={isLoading}
          />
        </section>
        <OverviewRankList
          title="Kurye Performansı"
          items={courierItems}
          isLoading={isLoading}
          emptyText="Bu dönemde kurye atanmış teslimat yok."
        />
        <SectionTitle>Yoğunluk</SectionTitle>
        <OverviewHeatmap
          heatmap={insights?.heatmap ?? []}
          max={insights?.heatmapMax ?? 0}
          isLoading={isLoading}
        />
          </>
        )}

        {/* ════════ MÜŞTERİ ════════ */}
        {view === "musteri" && (
          <>
        <SectionTitle>Sadakat</SectionTitle>
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
        <OverviewRankList
          title="En Değerli Müşteriler"
          items={topCustomerItems}
          isLoading={isLoading}
          emptyText="Bu dönemde müşteri verisi yok."
        />
          </>
        )}

        {/* ════════ FİNANS ════════ */}
        {view === "finans" && (
          <>
        <SectionTitle>Açık Hesaplar (Veresiye)</SectionTitle>
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Toplam Alacak</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {openAcc ? formatCurrency(openAcc.totalOpen) : "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {openAcc
                  ? `${openAcc.count} açık sipariş · ${openAcc.customerCount} müşteri`
                  : "—"}
              </p>
              <Link
                href="/open-accounts"
                className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              >
                Tümünü yönet →
              </Link>
            </CardContent>
          </Card>
          <div className="lg:col-span-2">
            <OverviewRankList
              title="En Yüksek Borçlular"
              items={debtorItems}
              isLoading={isLoading}
              emptyText="Açık hesap yok — tahsilat temiz. 👍"
            />
          </div>
        </section>
          </>
        )}
      </div>

      {/* Bölge haritası — "Harita" butonuyla modalda (sayfa temiz kalsın) */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Siparişler Nereden Geldi</DialogTitle>
            <DialogDescription>{subtitle} · pinli sipariş konumları</DialogDescription>
          </DialogHeader>
          {mapOpen && (
            <OverviewRegionMap
              period={period}
              source={source}
              dayOffset={dayOffset}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Detaylı analiz bölüm başlığı yardımcısı aşağıda tanımlı */}

      {/* KPI kartı → tüm siparişler; ödeme satırı → o yöntemin siparişleri */}
      <PeriodOrdersDialog
        open={ordersOpen}
        onOpenChange={setOrdersOpen}
        title={payFilter ? `${payFilter.label} — Siparişler` : `${subtitle} — Siparişler`}
        period={period}
        source={source}
        dayOffset={dayOffset}
        paymentMethod={payFilter?.key}
      />
    </div>
  );
}

// Analiz zonu bölüm başlığı — üstte ince ayraçla gruplar arası ayrım.
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
