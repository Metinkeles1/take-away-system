"use client";

import { memo, useMemo } from "react";
import {
  Package,
  Banknote,
  CreditCard,
  Ticket,
  Globe,
  ArrowRightLeft,
  Coins,
  Bike,
  Landmark,
  Hand,
  PieChart,
} from "lucide-react";
import type { EndOfDayReport } from "@/actions/endOfDay";
import { formatCurrency, cn } from "@/lib/utils";

// Günün Dökümü — gün sonu sayfasında özet kartlarının altında, tıklamadan
// görünen görsel kırılım: kaç paket gitti, para hangi yöntemle geldi, Trendyol
// brütten nete ne getirdi. Veri tamamen EndOfDayReport'tan (yeni sorgu yok).
// Renkler Komuta ile aynı: Kendi = mavi, Trendyol = turuncu.

const OWN_BAR = "bg-blue-500";
const TY_BAR = "bg-orange-500";

// Kesinti (komisyon + sağlayıcı) kısmı — renk yerine desenle ayrışır.
const DEDUCTION_STYLE: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--muted-foreground) 0 1px, transparent 1px 5px)",
  opacity: 0.35,
};

const METHODS: {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "cash", label: "Nakit", icon: Banknote },
  { key: "card", label: "Kart (POS)", icon: CreditCard },
  { key: "meal_card", label: "Yemek Kartı (Ticket)", icon: Ticket },
  { key: "online", label: "Online Ödeme", icon: Globe },
  { key: "iban", label: "IBAN / Havale", icon: ArrowRightLeft },
];

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function fmtPct(n: number): string {
  return `%${n < 10 && n > 0 ? n.toFixed(1).replace(".", ",") : Math.round(n)}`;
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className={cn("size-2 rounded-full", OWN_BAR)} />
        Kendi
      </span>
      <span className="flex items-center gap-1">
        <span className={cn("size-2 rounded-full", TY_BAR)} />
        Trendyol
      </span>
    </span>
  );
}

function CardShell({
  icon: Icon,
  iconClass,
  title,
  right,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={cn("size-4", iconClass)} />
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

// Kendi + Trendyol yığılmış yatay çubuk. widthPct: çubuğun toplam uzunluğu
// (satırlar arası büyüklük kıyası için); segmentler arasında 2px boşluk.
function SplitBar({
  own,
  ty,
  widthPct = 100,
  format,
  height = "h-2.5",
}: {
  own: number;
  ty: number;
  widthPct?: number;
  format: (n: number) => string;
  height?: string;
}) {
  const total = own + ty;
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-muted", height)}>
      <div className="flex h-full gap-0.5" style={{ width: `${Math.max(widthPct, total > 0 ? 2 : 0)}%` }}>
        {own > 0 && (
          <div
            className={cn("h-full rounded-full", OWN_BAR)}
            style={{ width: `${pct(own, total)}%` }}
            title={`Kendi: ${format(own)}`}
          />
        )}
        {ty > 0 && (
          <div
            className={cn("h-full rounded-full", TY_BAR)}
            style={{ width: `${pct(ty, total)}%` }}
            title={`Trendyol: ${format(ty)}`}
          />
        )}
      </div>
    </div>
  );
}

// ── 1) Paketler ──────────────────────────────────────────────────────────────
function PackagesCard({ report }: { report: EndOfDayReport }) {
  const ty = report.trendyol?.available ? report.trendyol : null;
  const tyCount = ty?.orderCount ?? 0;
  const ownCount = report.packageCount - tyCount;
  const tyRevenue = ty?.revenue ?? 0;
  const ownRevenue = report.totalRevenue - tyRevenue;
  const cancelled = report.cancelledCount;
  const count = (n: number) => `${n} paket`;

  return (
    <CardShell icon={Package} iconClass="text-blue-500" title="Paketler" right={<Legend />}>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums">{report.packageCount}</span>
        <span className="text-sm text-muted-foreground">paket gitti</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>Paket payı</span>
          <span>
            Kendi {fmtPct(pct(ownCount, report.packageCount))} · Trendyol{" "}
            {fmtPct(pct(tyCount, report.packageCount))}
          </span>
        </span>
        <SplitBar own={ownCount} ty={tyCount} format={count} height="h-3" />
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex flex-col rounded-lg bg-blue-500/8 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">Kendi</span>
            <span className="font-semibold tabular-nums">{ownCount} paket</span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatCurrency(ownRevenue)}</span>
          </div>
          <div className="flex flex-col rounded-lg bg-orange-500/8 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">Trendyol</span>
            <span className="font-semibold tabular-nums">{tyCount} paket</span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatCurrency(tyRevenue)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>Ciro payı (brüt)</span>
          <span>
            Kendi {fmtPct(pct(ownRevenue, report.totalRevenue))} · Trendyol{" "}
            {fmtPct(pct(tyRevenue, report.totalRevenue))}
          </span>
        </span>
        <SplitBar own={ownRevenue} ty={tyRevenue} format={formatCurrency} height="h-3" />
      </div>

      <dl className="mt-auto grid grid-cols-3 divide-x rounded-lg border text-center">
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <dt className="text-[11px] text-muted-foreground">Brüt Ciro</dt>
          <dd className="text-sm font-semibold tabular-nums">{formatCurrency(report.totalRevenue)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <dt className="text-[11px] text-muted-foreground">Ort. Sepet</dt>
          <dd className="text-sm font-semibold tabular-nums">{formatCurrency(report.avgBasket)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <dt className="text-[11px] text-muted-foreground">İptal</dt>
          <dd className={cn("text-sm font-semibold tabular-nums", cancelled > 0 && "text-red-600 dark:text-red-400")}>
            {cancelled}
          </dd>
        </div>
      </dl>
    </CardShell>
  );
}

// ── 2) Para nasıl geldi — ödeme yöntemine göre (brüt) ────────────────────────
// Birleşik paymentBreakdown − yerel = Trendyol payı (aynı key'ler). Eski
// snapshot'larda da çalışır.
function PaymentsCard({ report }: { report: EndOfDayReport }) {
  const rows = useMemo(() => {
    const local = new Map(report.localPaymentBreakdown.map((r) => [r.key, r]));
    const all = new Map(report.paymentBreakdown.map((r) => [r.key, r]));
    return METHODS.map((m) => {
      const l = local.get(m.key);
      const a = all.get(m.key);
      const ownAmount = l?.amount ?? 0;
      const ownCount = l?.count ?? 0;
      const tyAmount = Math.max(0, (a?.amount ?? 0) - ownAmount);
      const tyCount = Math.max(0, (a?.count ?? 0) - ownCount);
      return {
        ...m,
        ownAmount,
        tyAmount,
        amount: ownAmount + tyAmount,
        count: ownCount + tyCount,
        ownCount,
        tyCount,
      };
    })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [report]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const max = rows[0]?.amount ?? 0;

  return (
    <CardShell
      icon={PieChart}
      iconClass="text-emerald-500"
      title="Para Nasıl Geldi?"
      right={<Legend />}
      className="lg:col-span-2"
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Bu gün ödeme kaydı yok.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3.5">
            {rows.map((r) => {
              const Icon = r.icon;
              return (
                <li key={r.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{r.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {r.count} paket
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                      <span className="text-xs text-muted-foreground">{fmtPct(pct(r.amount, total))}</span>
                      <span className="font-semibold">{formatCurrency(r.amount)}</span>
                    </span>
                  </div>
                  <SplitBar
                    own={r.ownAmount}
                    ty={r.tyAmount}
                    widthPct={pct(r.amount, max)}
                    format={formatCurrency}
                  />
                  {r.tyAmount > 0 && r.ownAmount > 0 && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      Kendi {r.ownCount} · {formatCurrency(r.ownAmount)} — Trendyol {r.tyCount} ·{" "}
                      {formatCurrency(r.tyAmount)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">Toplam (brüt)</span>
            <span className="font-bold tabular-nums">{formatCurrency(total)}</span>
          </div>
        </>
      )}
    </CardShell>
  );
}

// ── 3) Trendyol ne getirdi — brüt → kesinti → net ────────────────────────────
function NetBar({ gross, net }: { gross: number; net: number }) {
  const netPct = Math.min(100, pct(net, gross));
  return (
    <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${netPct}%` }}
        title={`Net: ${formatCurrency(net)}`}
      />
      <div
        className="h-full flex-1 rounded-full"
        style={DEDUCTION_STYLE}
        title={`Kesinti: ${formatCurrency(Math.max(0, gross - net))}`}
      />
    </div>
  );
}

function TyFlowRow({
  icon: Icon,
  title,
  note,
  count,
  gross,
  net,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  note: string;
  count: number;
  gross: number;
  net: number;
}) {
  if (count <= 0 && gross <= 0) return null;
  const cut = Math.max(0, gross - net);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{title}</span>
            <span className="text-[11px] text-muted-foreground">
              {count} paket · {note}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end tabular-nums">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(net)}</span>
          <span className="text-[11px] text-muted-foreground">brüt {formatCurrency(gross)}</span>
        </span>
      </div>
      <NetBar gross={gross} net={net} />
      <span className="text-[11px] text-muted-foreground tabular-nums">
        Kesinti {formatCurrency(cut)} ({fmtPct(pct(cut, gross))})
      </span>
    </div>
  );
}

function TrendyolCard({ report }: { report: EndOfDayReport }) {
  const ty = report.trendyol;
  const e = ty?.earnings;

  const flow = useMemo(() => {
    const lines = ty?.lines ?? [];
    const sum = (g: "online" | "onsite") =>
      lines.filter((l) => l.group === g).reduce(
        (s, l) => ({ count: s.count + l.count, gross: s.gross + l.gross }),
        { count: 0, gross: 0 },
      );
    const on = sum("online");
    const off = sum("onsite");
    // lines yoksa (eski snapshot) earnings brütlerine düş.
    if (lines.length === 0 && e) {
      on.count = e.creditCard.count + e.ticket.count;
      on.gross = e.creditCard.gross + e.ticket.gross;
      off.count = e.onDelivery?.count ?? 0;
      off.gross = e.onDelivery?.gross ?? 0;
    }
    return { on, off };
  }, [ty?.lines, e]);

  if (!ty?.available) {
    return (
      <CardShell icon={Bike} iconClass="text-orange-500" title="Trendyol Ne Getirdi?" className="lg:col-span-3">
        <p className="py-6 text-center text-sm text-muted-foreground">Trendyol verisi okunamadı.</p>
      </CardShell>
    );
  }
  if (ty.orderCount === 0) {
    return (
      <CardShell icon={Bike} iconClass="text-orange-500" title="Trendyol Ne Getirdi?" className="lg:col-span-3">
        <p className="py-6 text-center text-sm text-muted-foreground">Bu gün Trendyol siparişi yok.</p>
      </CardShell>
    );
  }

  const bankNet = e?.totalBankNet ?? ty.netRevenue;
  const hasOnsiteNet = !!e?.onDelivery;
  const onsiteNet = e?.onDelivery?.bankNet ?? 0;
  const net = bankNet + onsiteNet;
  const gross = ty.revenue;

  return (
    <CardShell
      icon={Bike}
      iconClass="text-orange-500"
      title="Trendyol Ne Getirdi?"
      className="lg:col-span-3"
      right={
        <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />
            Sana kalan
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={DEDUCTION_STYLE} />
            Kesinti
          </span>
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Eline geçen (net)</span>
          <span className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCurrency(net)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {ty.orderCount} paket · brüt {formatCurrency(gross)} · paket başı net{" "}
            {formatCurrency(ty.orderCount > 0 ? net / ty.orderCount : 0)}
          </span>
        </div>

        <div className="flex flex-col gap-4 md:col-span-2 md:flex-row md:gap-6 *:flex-1">
          <TyFlowRow
            icon={Landmark}
            title="Online — bankaya yatacak"
            note="kredi kartı + online yemek kartı"
            count={flow.on.count}
            gross={flow.on.gross}
            net={bankNet}
          />
          {/* Eski snapshot'larda kapıda neti yok → satır %100 kesinti gibi görünmesin */}
          {hasOnsiteNet && (
            <TyFlowRow
              icon={Hand}
              title="Kapıda — kuryeyle elden"
              note="nakit / kart / yemek kartı kodu"
              count={flow.off.count}
              gross={flow.off.gross}
              net={onsiteNet}
            />
          )}
        </div>
      </div>

      {e && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Kesinti = Trendyol komisyonu (~%{(e.commissionRate * 100).toFixed(0)}) + kampanya
          indirimleri + yemek kartı sağlayıcı payı. Brüt tutarlar Trendyol paneliyle aynıdır.
        </p>
      )}
    </CardShell>
  );
}

// ── Bölüm ────────────────────────────────────────────────────────────────────
export const DayBreakdown = memo(function DayBreakdown({ report }: { report: EndOfDayReport }) {
  if (report.packageCount === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Coins className="size-4" />
        Günün Dökümü
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PackagesCard report={report} />
        <PaymentsCard report={report} />
        <TrendyolCard report={report} />
      </div>
    </div>
  );
});
