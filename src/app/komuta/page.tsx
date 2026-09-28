"use client";

import { useState } from "react";

import { type KomutaOperations, type KomutaOverview } from "@/actions/komutaOverview";
import { type DashboardInsights } from "@/actions/dashboardInsights";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatCurrencyShort } from "@/lib/utils";

import { useKomutaFilters } from "@/components/dashboard/komuta/KomutaShell";
import { useKomutaQuery } from "@/components/dashboard/komuta/useKomutaQuery";
import { ChannelSplitBar, Segmented, StatStrip } from "@/components/dashboard/komuta/KomutaUI";
import { KomutaMetricCard } from "@/components/dashboard/komuta/KomutaMetricCard";
import { KomutaRecentOrders } from "@/components/dashboard/komuta/KomutaRecentOrders";
import { KomutaTrendChart } from "@/components/dashboard/komuta/KomutaTrendChart";
import { KomutaHeatmap } from "@/components/dashboard/komuta/KomutaHeatmap";
import { KomutaRankList, type KomutaRankItem } from "@/components/dashboard/komuta/KomutaRankList";
import { ChannelSplitSheet, type ChannelSplitData } from "@/components/dashboard/komuta/ChannelSplitSheet";
import { KomutaOrdersDialog } from "@/components/dashboard/komuta/KomutaOrdersDialog";
import { KomutaPerformanceAlert } from "@/components/dashboard/komuta/performance/KomutaPerformanceAlert";

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

const fmtInt = (n: number) => n.toLocaleString("tr-TR");

// Komuta › Genel Bakış — KPI şeridi, dikkat şeridi, ciro trendi + son siparişler,
// ürün / ödeme / bölge ve saat bazlı yoğunluk. Filtreler çerçevede (KomutaShell).
export default function KomutaOverviewPage() {
  const { period, channel, dayOffset, label, refreshKey } = useKomutaFilters();

  const [ordersOpen, setOrdersOpen] = useState(false);
  const [allProductsOpen, setAllProductsOpen] = useState(false);
  const [productSort, setProductSort] = useState<"most" | "least">("most");
  const [split, setSplit] = useState<ChannelSplitData | null>(null);

  // Hepsi paralel çekilir ve sayfalar arası hafızada kalır (useKomutaQuery).
  const args = [period, channel, dayOffset];
  const overviewQ = useKomutaQuery<KomutaOverview>("overview", args, { refreshKey });
  const insightsQ = useKomutaQuery<DashboardInsights>("insights", args, { refreshKey });
  const targetQ = useKomutaQuery<number>("target", [], { refreshKey });
  // Bölge + saat yoğunluğu — ağır sorgu, KPI'ları bekletmez.
  const opsQ = useKomutaQuery<KomutaOperations>("operations", args, { refreshKey });

  const data = overviewQ.data;
  const insights = insightsQ.data;
  const operations = opsQ.data;
  const target = targetQ.data ?? 0;

  const isLoading = overviewQ.isLoading;
  const cur = data?.current;
  const prev = data?.previous;
  const showLive = period === "day" && dayOffset === 0;
  const showLegend = channel === "all";

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
      ? `${label} · saat saat`
      : channel === "trendyol"
        ? `${label} · saat dağılımı (Trendyol günlük veri vermez)`
        : channel === "all"
          ? `${label} · gün gün (Trendyol günlük dökümü hariç)`
          : `${label} · gün gün`;

  // ─── Kanal oranı — yalnız "Hepsi"de anlamlı ───
  const bd = data?.breakdown;
  const splitBar = (own: number, ty: number, fmt: (n: number) => string) =>
    channel === "all" && bd ? <ChannelSplitBar own={own} trendyol={ty} format={fmt} /> : null;

  // ─── İptal — kendi (DB) + Trendyol (API) birleşik; Sipariş hücresinin altında ───
  const tyOps = data?.trendyolOps;
  const tyOpsIncluded = (channel === "all" || channel === "trendyol") && !!tyOps?.available;
  const ownCancel = channel !== "trendyol" ? insights?.cancel : undefined;
  const cancelCount = (ownCancel?.cancelled ?? 0) + (tyOpsIncluded ? tyOps!.cancelled : 0);
  const cancelBase =
    (ownCancel?.total ?? 0) + (tyOpsIncluded ? tyOps!.orderCount + tyOps!.cancelled : 0);
  const cancelRate = cancelBase > 0 ? (cancelCount / cancelBase) * 100 : 0;
  const cancelLine =
    insights && cancelBase > 0 ? (
      <span
        className={cn(
          "text-[11px] tabular-nums",
          cancelRate > 5 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
        )}
      >
        {cancelCount > 0
          ? `İptal %${cancelRate.toFixed(1)} · ${fmtInt(cancelCount)} sipariş`
          : "İptal yok"}
      </span>
    ) : null;

  // ─── Sıralı listeler (iki renkli çubuk: mavi kendi, turuncu Trendyol) ───
  const splitProducts = data?.splitProducts ?? [];
  const splitPayments = data?.splitPayments ?? [];

  const maxProductQty = Math.max(1, ...splitProducts.map((p) => p.quantity));
  const productItems: KomutaRankItem[] = splitProducts.map((p) => ({
    id: p.name,
    label: p.name,
    primary: `${p.quantity} adet · ${formatCurrencyShort(p.revenue)}`,
    ownShare: (p.own.quantity / maxProductQty) * 100,
    tyShare: (p.trendyol.quantity / maxProductQty) * 100,
  }));
  const modalProductItems = productSort === "most" ? productItems : [...productItems].reverse();

  const maxPayAmount = Math.max(1, ...splitPayments.map((p) => p.amount));
  const paymentTotal = Math.max(1, splitPayments.reduce((s, p) => s + p.amount, 0));
  const paymentItems: KomutaRankItem[] = splitPayments.map((p) => ({
    id: p.key,
    label: p.label,
    primary: `${formatCurrencyShort(p.amount)} · %${Math.round((p.amount / paymentTotal) * 100)}`,
    ownShare: (p.own / maxPayAmount) * 100,
    tyShare: (p.trendyol / maxPayAmount) * 100,
  }));

  const regions = operations?.regions ?? [];
  const maxRegion = Math.max(1, ...regions.map((r) => r.total));
  const regionItems: KomutaRankItem[] = regions.map((r) => ({
    id: r.name,
    label: r.name,
    primary: `${r.total} sip · ${formatCurrencyShort(r.revenue)}`,
    ownShare: (r.own / maxRegion) * 100,
    tyShare: (r.trendyol / maxRegion) * 100,
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
  const openRegionSplit = (name: string) => {
    const r = regions.find((x) => x.name === name);
    if (!r) return;
    setSplit({
      title: r.name,
      subtitle: `${r.total} sipariş · ${formatCurrencyShort(r.revenue)} · ${label}`,
      own: { value: `${r.own} sip · ${formatCurrencyShort(r.ownRevenue)}`, raw: r.own },
      trendyol: {
        value: `${r.trendyol} sip · ${formatCurrencyShort(r.trendyolRevenue)}`,
        raw: r.trendyol,
      },
      ordersQuery: { period, channel, dayOffset, district: r.name },
    });
  };

  const showTarget = period === "month" && dayOffset === 0 && target > 0;
  const targetPct = showTarget && cur ? Math.min(100, (cur.revenue / target) * 100) : 0;
  const openAllOrders = () => setOrdersOpen(true);

  return (
    <>
      {/* ─── KPI şeridi ─── */}
      <StatStrip className="grid-cols-2 lg:grid-cols-4">
        <KomutaMetricCard
          label="Ciro"
          value={formatCurrencyShort(cur?.revenue ?? 0)}
          delta={cur && prev ? pct(cur.revenue, prev.revenue) : null}
          comparisonLabel={compareLabel}
          isLoading={isLoading}
          onClick={openAllOrders}
          footer={splitBar(bd?.own.revenue ?? 0, bd?.trendyol.revenue ?? 0, formatCurrencyShort)}
        />
        <KomutaMetricCard
          label="Net (cebe giren)"
          value={formatCurrencyShort(cur?.net ?? 0)}
          delta={cur && prev ? pct(cur.net, prev.net) : null}
          comparisonLabel={compareLabel}
          accent
          isLoading={isLoading}
          onClick={openAllOrders}
          footer={splitBar(bd?.own.net ?? 0, bd?.trendyol.net ?? 0, formatCurrencyShort)}
        />
        <KomutaMetricCard
          label="Sipariş"
          value={fmtInt(cur?.orderCount ?? 0)}
          delta={cur && prev ? pct(cur.orderCount, prev.orderCount) : null}
          comparisonLabel={compareLabel}
          isLoading={isLoading}
          onClick={openAllOrders}
          footer={
            splitBar(bd?.own.orderCount ?? 0, bd?.trendyol.orderCount ?? 0, fmtInt) || cancelLine ? (
              <>
                {splitBar(bd?.own.orderCount ?? 0, bd?.trendyol.orderCount ?? 0, fmtInt)}
                {cancelLine}
              </>
            ) : null
          }
        />
        <KomutaMetricCard
          label="Ortalama sepet"
          value={formatCurrencyShort(cur?.avgBasket ?? 0)}
          delta={cur && prev ? pct(cur.avgBasket, prev.avgBasket) : null}
          comparisonLabel={compareLabel}
          isLoading={isLoading}
          onClick={openAllOrders}
        />
      </StatStrip>

      {showTarget && cur && (
        <Card className="py-0 shadow-xs">
          <CardContent className="p-4">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-medium">Aylık hedef</span>
              <span className="tabular-nums text-muted-foreground">
                {formatCurrencyShort(cur.revenue)} / {formatCurrencyShort(target)}
                <span className="ml-2 font-semibold text-foreground">%{targetPct.toFixed(0)}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
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

      <KomutaPerformanceAlert period={period} channel={channel} dayOffset={dayOffset} />

      {/* ─── Trend + son siparişler ─── */}
      <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <div className={cn("h-full", showLive ? "lg:col-span-2" : "lg:col-span-3")}>
          <KomutaTrendChart
            data={data?.splitTrend ?? []}
            title="Ciro trendi"
            description={trendDesc}
            isLoading={isLoading}
            trimEmptyEdges={period === "day"}
          />
        </div>
        {showLive && (
          <KomutaRecentOrders period={period} channel={channel} dayOffset={dayOffset} />
        )}
      </section>

      {/* ─── Ürün / ödeme / bölge ─── */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KomutaRankList
          title="En çok satan"
          items={productItems}
          isLoading={isLoading}
          emptyText="Bu dönemde satış yok."
          showLegend={showLegend}
          hint="Satıra tıkla → kendi/Trendyol kırılımı"
          onItemClick={openProductSplit}
          maxItems={5}
          onShowAll={() => setAllProductsOpen(true)}
        />
        <KomutaRankList
          title="Nasıl ödendi"
          items={paymentItems}
          isLoading={isLoading}
          emptyText="Tahsilat verisi yok."
          showLegend={showLegend}
          hint="Yemek kartına tıkla → marka kırılımı"
          onItemClick={openPaymentSplit}
        />
        <KomutaRankList
          title="Bölgeler"
          items={regionItems}
          isLoading={opsQ.isLoading}
          emptyText="Bu dönemde bölge verisi yok (siparişlerde mahalle kayıtlı değil)."
          showLegend={showLegend}
          hint="Satıra tıkla → o bölgenin siparişleri"
          onItemClick={openRegionSplit}
          maxItems={6}
        />
      </section>

      <KomutaHeatmap hourly={operations?.hourly ?? []} isLoading={opsQ.isLoading} />

      {/* En çok satan ürünlerin tamamı — modalda */}
      <Dialog open={allProductsOpen} onOpenChange={setAllProductsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{productSort === "most" ? "En çok satan ürünler" : "En az satan ürünler"}</DialogTitle>
            <DialogDescription>
              {label} · {splitProducts.length} ürün · satıra tıkla → kendi/Trendyol kırılımı
            </DialogDescription>
          </DialogHeader>
          <Segmented
            ariaLabel="Sıralama"
            value={productSort}
            onChange={setProductSort}
            options={[
              { id: "most", label: "Çok satan" },
              { id: "least", label: "Az satan" },
            ]}
            className="self-start"
          />
          <KomutaRankList
            bare
            title={productSort === "most" ? "En çok satan ürünler" : "En az satan ürünler"}
            items={modalProductItems}
            isLoading={isLoading}
            emptyText="Bu dönemde satış yok."
            showLegend={showLegend}
            onItemClick={(name) => {
              setAllProductsOpen(false);
              openProductSplit(name);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* KPI → dönem siparişleri (Kendi DB + Trendyol API birlikte) */}
      <KomutaOrdersDialog
        open={ordersOpen}
        onOpenChange={setOrdersOpen}
        title={`${label} — Siparişler`}
        period={period}
        channel={channel}
        dayOffset={dayOffset}
      />

      <ChannelSplitSheet data={split} onClose={() => setSplit(null)} />
    </>
  );
}
