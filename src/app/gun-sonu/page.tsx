"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Printer,
  RefreshCw,
  Wallet,
  Receipt,
  Building2,
  Lock,
  LockKeyhole,
  Bike,
  Archive,
  Bot,
  Hand,
  Landmark,
  CreditCard,
  Coins,
  Banknote,
  Ticket,
  ArrowRightLeft,
  Globe,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  getEndOfDay,
  saveEndOfDaySnapshot,
  listEndOfDaySnapshots,
  type EndOfDayReport,
  type EndOfDaySnapshotSummary,
  type EndOfDayTrendyol,
  type EndOfDayTrendyolLine,
  type EndOfDayBreakdownRow,
  type EndOfDayOrderRow,
  type EndOfDayComparison,
} from "@/actions/endOfDay";
import EndOfDayReceipt from "@/components/receipt/EndOfDayReceipt";
import { formatCurrency, cn } from "@/lib/utils";

// Ödeme yöntemi defteri — yöntem başına ikon + etiket + sabit sıra.
const METHOD_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; accent: string }
> = {
  cash: { label: "Nakit", icon: Banknote, accent: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  card: { label: "Kredi / Banka Kartı", icon: CreditCard, accent: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  meal_card: { label: "Yemek Kartı (Ticket)", icon: Ticket, accent: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  online: { label: "Online Ödeme", icon: Globe, accent: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  iban: { label: "IBAN / Havale", icon: ArrowRightLeft, accent: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  other: { label: "Diğer / Belirsiz", icon: Coins, accent: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
};
const METHOD_ORDER = ["cash", "card", "meal_card", "online", "iban", "other"];

// "1.234,50" / "1234.5" / "" → number | null. Boş veya geçersizse null.
function parseAmount(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Istanbul "bugün" tarihini YYYY-MM-DD olarak verir (date input default'u).
function istanbulToday(): string {
  const ist = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = `${ist.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${ist.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Trendyol kartı — online (bankaya) vs kapıda/kod (elden) net dökümü ────────
// Sol tutarlar BRÜT satış (Trendyol paneliyle kıyaslanır); grup başına sağdaki
// net toplam komisyon + yemek kartı sağlayıcı kesintisi sonrası eline geçendir.
const TyLineRow = memo(function TyLineRow({ l }: { l: EndOfDayTrendyolLine }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 truncate">{l.label}</span>
      <span className="flex shrink-0 items-baseline gap-2.5">
        <span className="text-[11px] text-muted-foreground tabular-nums">{l.count} sip.</span>
        <span className="font-medium tabular-nums">{formatCurrency(l.gross)}</span>
      </span>
    </div>
  );
});

const TyGroup = memo(function TyGroup({
  icon: Icon,
  title,
  lines,
  net,
  netLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  lines: EndOfDayTrendyolLine[];
  net: number;
  netLabel: string;
}) {
  if (lines.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/8">
      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </div>
      <div className="divide-y px-3">
        {lines.map((l, i) => (
          <TyLineRow key={i} l={l} />
        ))}
      </div>
      <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2">
        <span className="text-sm font-medium">{netLabel}</span>
        <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
          {formatCurrency(net)}
        </span>
      </div>
    </div>
  );
});

const TrendyolEarningsCard = memo(function TrendyolEarningsCard({
  trendyol,
}: {
  trendyol: EndOfDayTrendyol | null;
}) {
  if (!trendyol) return null;

  if (!trendyol.available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bike className="size-4 text-orange-500" />
            Trendyol
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Trendyol verisi API&apos;dan okunamadı
            {trendyol.error ? ` · ${trendyol.error}` : ""}
          </p>
        </CardContent>
      </Card>
    );
  }

  const e = trendyol.earnings;
  const lines = trendyol.lines ?? [];
  const online = lines.filter((l) => l.group === "online");
  const onsite = lines.filter((l) => l.group === "onsite");
  const bankNet = e?.totalBankNet ?? trendyol.netRevenue;
  const onsiteNet = e?.onDelivery?.bankNet ?? 0;
  const toplam = bankNet + onsiteNet;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bike className="size-4 text-orange-500" />
          Trendyol
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {trendyol.orderCount} sipariş · brüt {formatCurrency(trendyol.revenue)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!e || trendyol.orderCount === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Bu gün Trendyol siparişi yok
          </p>
        ) : (
          <div className="space-y-4">
            <TyGroup
              icon={Landmark}
              title="Online — bankaya yatacak"
              lines={online}
              net={bankNet}
              netLabel="Bankaya Yatacak (net)"
            />
            <TyGroup
              icon={Hand}
              title="Kapıda / kod — elden tahsil"
              lines={onsite}
              net={onsiteNet}
              netLabel="Kapıda Tahsilat (net)"
            />

            <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-3 ring-1 ring-emerald-500/20">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <Bike className="size-4" />
                Trendyol Toplam (net)
              </span>
              <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(toplam)}
              </span>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Soldaki tutarlar <b>brüt satıştır</b> (Trendyol paneliyle aynı). Sağdaki net
              toplamlar komisyon (~%{(e.commissionRate * 100).toFixed(0)}) ve yemek kartı
              sağlayıcı kesintisi sonrası sana geçen tutardır.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ── Kasa Sayımı — elle girilen nakit / kredi kartı / IBAN / ticket toplamları ──
// Trendyol HARİÇ kendi tahsilatların. Toplamı, sistemdeki yerel paket cirosuyla
// (yine Trendyol hariç) kıyaslanır → "kasam siparişlerden az mı çok mu" teyidi.
// Gün kapatılınca snapshot'a kaydedilir. Toplam ciroya EKLENMEZ (mükerrer olmaz).
const CashCountCard = memo(function CashCountCard({
  cashValue,
  cardValue,
  ibanValue,
  ticketValue,
  onCashChange,
  onCardChange,
  onIbanChange,
  onTicketChange,
  localPayments,
  openAmount,
  openCount,
  corporateTotal,
  trendyolBankNet,
  trendyolOnDeliveryNet,
  closed,
  disabled,
}: {
  cashValue: string;
  cardValue: string;
  ibanValue: string;
  ticketValue: string;
  onCashChange: (v: string) => void;
  onCardChange: (v: string) => void;
  onIbanChange: (v: string) => void;
  onTicketChange: (v: string) => void;
  localPayments: Record<string, number>; // sistemdeki yerel satış, yönteme göre (Trendyol hariç)
  openAmount: number; // açık hesap (tahsil edilmemiş) — ciroya dahil değil, bilgi amaçlı
  openCount: number;
  corporateTotal: number; // o gün kurumsallara giden toplam — Genel Toplam'a dahil
  trendyolBankNet: number | null; // Trendyol online bankaya gelen net (otomatik)
  trendyolOnDeliveryNet: number; // Trendyol kapıda tahsilat (komisyon sonrası net) — kasana girer
  closed: boolean;
  disabled: boolean;
}) {
  const cash = parseAmount(cashValue);
  const card = parseAmount(cardValue);
  const iban = parseAmount(ibanValue);
  const ticket = parseAmount(ticketValue);
  const total = (cash ?? 0) + (card ?? 0) + (iban ?? 0) + (ticket ?? 0);
  const hasAny = cash != null || card != null || iban != null || ticket != null;
  // Sistemdeki yerel satış (sadece kasa alanlarının kapsadığı 4 yöntem).
  const systemTotal =
    (localPayments.cash ?? 0) +
    (localPayments.card ?? 0) +
    (localPayments.iban ?? 0) +
    (localPayments.meal_card ?? 0);
  const diff = total - systemTotal; // + → kasa fazla; − → eksik (uyarı)
  // Genel toplam = elle girilen kasa + Trendyol online net (bankaya) +
  // Trendyol kapıda net (kendi kasana) + kurumsal satış.
  const grandTotal =
    total + (trendyolBankNet ?? 0) + trendyolOnDeliveryNet + corporateTotal;

  const field = (
    icon: React.ComponentType<{ className?: string }>,
    label: string,
    value: string,
    onChange: (v: string) => void,
    systemAmount: number, // sistemde bu yöntemle yapılan yerel satış
  ) => {
    const Icon = icon;
    const counted = parseAmount(value);
    const d = (counted ?? 0) - systemAmount; // girilen − sistem
    const showCmp = systemAmount > 0.5 || counted != null;
    return (
      <label className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">{label}</span>
          {showCmp && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              Sistem {formatCurrency(systemAmount)}
              {counted != null && (
                <>
                  {" · "}
                  <span
                    className={cn(
                      "font-medium",
                      d < -0.5
                        ? "text-rose-600 dark:text-rose-400"
                        : d > 0.5
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {d < -0.5
                      ? `eksik ${formatCurrency(d)}`
                      : d > 0.5
                        ? `fazla +${formatCurrency(d)}`
                        : "uyumlu"}
                  </span>
                </>
              )}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="0,00"
            className="w-28 rounded-md border bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <span className="text-sm text-muted-foreground">₺</span>
        </span>
      </label>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-emerald-500" />
          Kasa Sayımı
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">
            Trendyol hariç
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {field(Banknote, "Nakit", cashValue, onCashChange, localPayments.cash ?? 0)}
        {field(CreditCard, "Kredi Kartı (POS)", cardValue, onCardChange, localPayments.card ?? 0)}
        {field(ArrowRightLeft, "IBAN / Havale", ibanValue, onIbanChange, localPayments.iban ?? 0)}
        {field(Ticket, "Yemek Kartı (Ticket)", ticketValue, onTicketChange, localPayments.meal_card ?? 0)}

        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Coins className="size-4 text-muted-foreground" />
            Kasa Toplam
            <span className="text-[11px] font-normal text-muted-foreground">
              (Trendyol hariç)
            </span>
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {hasAny ? formatCurrency(total) : "—"}
          </span>
        </div>

        {/* Trendyol online net — bankaya gelen kısım, otomatik çekilir */}
        {trendyolBankNet != null && (
          <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Bike className="size-4 text-orange-500" />
              Trendyol Online (bankaya)
              <span className="text-[11px] font-normal text-muted-foreground">otomatik</span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(trendyolBankNet)}
            </span>
          </div>
        )}

        {/* Trendyol kapıda — kendi kuryenle topladığın, komisyon sonrası net */}
        {trendyolOnDeliveryNet > 0.5 && (
          <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Hand className="size-4 text-orange-500" />
              Trendyol Kapıda (net)
              <span className="text-[11px] font-normal text-muted-foreground">otomatik</span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(trendyolOnDeliveryNet)}
            </span>
          </div>
        )}

        {/* Kurumsal satış — o gün giden kurumsal fişler, otomatik */}
        {corporateTotal > 0.5 && (
          <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Building2 className="size-4 text-cyan-500" />
              Kurumsal Satış
              <span className="text-[11px] font-normal text-muted-foreground">otomatik</span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(corporateTotal)}
            </span>
          </div>
        )}

        {/* Genel toplam — kasa + Trendyol online + Trendyol kapıda + kurumsal */}
        {(hasAny || trendyolBankNet != null || trendyolOnDeliveryNet > 0.5 || corporateTotal > 0.5) && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-3 ring-1 ring-emerald-500/20">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              <Coins className="size-4" />
              Genel Toplam
            </span>
            <span className="text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
              {formatCurrency(grandTotal)}
            </span>
          </div>
        )}

        {/* Açık hesap — tahsil edilmemiş, ciroya/kasaya dahil DEĞİL; bilgi amaçlı */}
        {openAmount > 0.5 && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
              <Receipt className="size-4" />
              Açık Hesap
              <span className="text-[11px] font-normal text-muted-foreground">
                {openCount} sipariş · tahsil edilmedi
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
              {formatCurrency(openAmount)}
            </span>
          </div>
        )}

        {/* Mutabakat — kasa toplamı vs sistemdeki yöntem bazlı yerel satış */}
        {hasAny && (
          <div className="space-y-1.5 rounded-lg border px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>Sistem yerel satış (yöntem bazlı)</span>
              <span className="tabular-nums">{formatCurrency(systemTotal)}</span>
            </div>
            <div
              className={cn(
                "flex items-center justify-between gap-2 font-semibold",
                diff < -0.5
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              <span>{diff < -0.5 ? "Kasa eksik" : "Kasa farkı (fazla)"}</span>
              <span className="tabular-nums">
                {diff >= 0 ? "+" : ""}
                {formatCurrency(diff)}
              </span>
            </div>
            {diff < -0.5 && (
              <p className="text-[11px] font-normal text-rose-600/80 dark:text-rose-400/80">
                Kasan sistemdeki siparişlerden az — eksik tahsilat olabilir.
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          {closed
            ? "Kayıtlı. Değiştirip “Yeniden Kapat” ile güncelleyebilirsin."
            : "“Günü Kapat” ile birlikte kaydedilir."}
        </p>
      </CardContent>
    </Card>
  );
});

function formatDayTR(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Kapatılmış (dondurulmuş) günlerin arşivi — satıra tıklayınca o güne gider.
const ArchiveList = memo(function ArchiveList({
  snapshots,
  activeDate,
  isLoading,
  onSelect,
}: {
  snapshots: EndOfDaySnapshotSummary[];
  activeDate: string;
  isLoading: boolean;
  onSelect: (date: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="size-4 text-slate-500" />
          Kapatılan Günler
          {snapshots.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {snapshots.length} kayıt
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Henüz kapatılmış gün yok. Bir günü kapatınca burada listelenir.
          </p>
        ) : (
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {snapshots.map((s) => {
              const isActive = s.date === activeDate;
              const isCron = s.source === "cron";
              return (
                <button
                  key={s.date}
                  type="button"
                  onClick={() => onSelect(s.date)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50",
                    isActive && "border-primary bg-primary/5 ring-1 ring-primary/30",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{formatDayTR(s.date)}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {s.packageCount} paket
                      {s.closedAt &&
                        ` · ${new Date(s.closedAt).toLocaleString("tr-TR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(s.totalRevenue)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      isCron
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-slate-500/15 text-slate-600 dark:text-slate-300",
                    )}
                    title={isCron ? "Otomatik (cron) kapatıldı" : "Elle kapatıldı"}
                  >
                    {isCron ? <Bot className="size-3" /> : <Hand className="size-3" />}
                    {isCron ? "Oto" : "Elle"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ── Ödeme Yöntemi Defteri (SADECE kendi siparişler) ─────────────────────────
// Kasana giren kendi tahsilatların; yönteme göre adet + tutar. Satıra tıkla →
// o yöntemin siparişleri yan panelde. Trendyol burada DEĞİL (kendi kartında).
type MethodRow = {
  key: string;
  count: number;
  amount: number;
};

function buildMethodRows(local: EndOfDayBreakdownRow[]): MethodRow[] {
  return local
    .filter((r) => r.amount > 0)
    .map((r) => ({ key: r.key, count: r.count, amount: r.amount }))
    .sort((a, b) => {
      const ia = METHOD_ORDER.indexOf(a.key);
      const ib = METHOD_ORDER.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}

const PaymentLedger = memo(function PaymentLedger({
  rows,
  onSelect,
}: {
  rows: MethodRow[];
  onSelect: (key: string) => void;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="size-4 text-emerald-500" />
          Kendi Ödemelerim (kapıda / türlere göre)
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
            <ChevronRight className="size-3" />
            satıra tıkla · siparişleri gör
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Bu gün kendi ödeme kaydın yok
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-foreground/8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Yöntem</th>
                  <th className="px-3 py-2 text-center font-medium">Adet</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = METHOD_META[r.key] ?? METHOD_META.other;
                  const Icon = meta.icon;
                  return (
                    <tr
                      key={r.key}
                      onClick={() => onSelect(r.key)}
                      className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5 font-medium">
                          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", meta.accent)}>
                            <Icon className="size-3.5" />
                          </span>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{r.count}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {formatCurrency(r.amount)}
                      </td>
                      <td className="px-2 text-muted-foreground/50">
                        <ChevronRight className="size-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-3 py-2.5">Toplam</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {rows.reduce((s, r) => s + r.count, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Drill-down yan panel — seçilen yöntemin KENDİ siparişleri.
const OrdersSheet = memo(function OrdersSheet({
  method,
  orders,
  onClose,
}: {
  method: string | null;
  orders: EndOfDayOrderRow[];
  onClose: () => void;
}) {
  const meta = method ? METHOD_META[method] ?? METHOD_META.other : null;
  const Icon = meta?.icon ?? Coins;
  const list = method ? orders.filter((o) => o.method === method) : [];
  const ownTotal = list.reduce((s, o) => s + o.total, 0);

  return (
    <Sheet open={method != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2.5">
            <span className={cn("flex size-8 items-center justify-center rounded-lg", meta?.accent)}>
              <Icon className="size-4" />
            </span>
            {meta?.label ?? "Siparişler"}
          </SheetTitle>
          <SheetDescription className="tabular-nums">
            {list.length} kendi siparişi · {formatCurrency(ownTotal)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {list.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Bu yöntemle kendi siparişin yok
            </p>
          ) : (
            list.map((o, i) => {
              const inner = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      #{o.orderNumber}
                      {o.open && (
                        <span className="rounded bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          Açık
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {o.customer} · {o.time}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(o.total)}
                  </span>
                </>
              );
              return o.id ? (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  {inner}
                </Link>
              ) : (
                <div key={i} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                  {inner}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t bg-muted/30 p-4">
          <span className="text-sm text-muted-foreground">Toplam (kendi)</span>
          <span className="text-base font-bold tabular-nums">{formatCurrency(ownTotal)}</span>
        </div>
      </SheetContent>
    </Sheet>
  );
});

// Geçen aynı güne (−7) kıyas rozeti — snapshot varsa ciro değişimini gösterir.
function ComparisonBadge({
  comparison,
  current,
}: {
  comparison: EndOfDayComparison | null;
  current: number;
}) {
  if (!comparison || comparison.totalRevenue <= 0) return null;
  const diff = current - comparison.totalRevenue;
  const pct = Math.round((diff / comparison.totalRevenue) * 100);
  const flat = Math.abs(pct) < 1;
  const Icon = flat ? Minus : diff > 0 ? TrendingUp : TrendingDown;
  const tone = flat
    ? "bg-muted text-muted-foreground"
    : diff > 0
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : "bg-rose-500/15 text-rose-600 dark:text-rose-400";
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", tone)}
      title={`Geçen hafta aynı gün: ${formatCurrency(comparison.totalRevenue)}`}
    >
      <Icon className="size-3" />
      {flat ? "geçen haftayla aynı" : `${diff > 0 ? "+" : ""}%${pct} geçen haftaya göre`}
    </span>
  );
}

export default function EndOfDayPage({ initialDate }: { initialDate?: string } = {}) {
  const [date, setDate] = useState(() => initialDate ?? istanbulToday());
  // Komuta Merkezi'ne gömülüyken seçili güne senkronla (route olarak açılınca
  // initialDate undefined → kendi tarih seçicisi çalışır).
  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);
  const [report, setReport] = useState<EndOfDayReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [closed, setClosed] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [snapshots, setSnapshots] = useState<EndOfDaySnapshotSummary[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  // Elle girilen kasa sayımı (string — boş bırakılabilir). Gün kapatılınca kaydedilir.
  const [cashCounted, setCashCounted] = useState("");
  const [cardCounted, setCardCounted] = useState("");
  const [ibanCounted, setIbanCounted] = useState("");
  const [ticketCounted, setTicketCounted] = useState("");
  // Geçen aynı güne kıyas + ödeme defteri drill-down (seçili yöntem).
  const [comparison, setComparison] = useState<EndOfDayComparison | null>(null);
  const [drillMethod, setDrillMethod] = useState<string | null>(null);

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      setSnapshots(await listEndOfDaySnapshots());
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getEndOfDay(date);
      setReport(data.report);
      setClosed(data.closed);
      setClosedAt(data.closedAt);
      setComparison(data.comparison);
      // Kayıtlı sayım varsa input'lara doldur (kapatılmış günü açınca görünür);
      // yoksa boşalt — başka güne geçince önceki günün rakamı kalmasın.
      setCashCounted(data.cashCounted != null ? String(data.cashCounted) : "");
      setCardCounted(data.cardCounted != null ? String(data.cardCounted) : "");
      setIbanCounted(data.ibanCounted != null ? String(data.ibanCounted) : "");
      setTicketCounted(data.ticketCounted != null ? String(data.ticketCounted) : "");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  const closeDay = useCallback(async () => {
    if (closed) {
      const ok = window.confirm(
        "Bu gün zaten kapatılmış. Yeniden kapatırsan eski kayıt güncel rakamlarla değiştirilir. Devam edilsin mi?",
      );
      if (!ok) return;
    }
    setIsClosing(true);
    try {
      await saveEndOfDaySnapshot(date, "manual", {
        cash: parseAmount(cashCounted),
        card: parseAmount(cardCounted),
        iban: parseAmount(ibanCounted),
        ticket: parseAmount(ticketCounted),
      });
      await Promise.all([load(), loadArchive()]);
    } finally {
      setIsClosing(false);
    }
  }, [
    date,
    closed,
    cashCounted,
    cardCounted,
    ibanCounted,
    ticketCounted,
    load,
    loadArchive,
  ]);

  // Fiş her zaman DOM'da mount; @media print ID üzerinden yalnızca fişi basar.
  const handlePrint = useCallback(() => window.print(), []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  useEffect(() => {
    document.title = "Gün Sonu Raporu · Paket Sipariş";
  }, []);

  // Mount başına bir kez — her render'da yeniden hesaplama yok.
  const today = useMemo(() => istanbulToday(), []);
  // Kasa mutabakatı için yöntem bazlı yerel satış (Trendyol hariç). Her kasa
  // alanı, sistemdeki aynı yöntemin yerel satışıyla karşılaştırılır.
  const localPayments = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of report?.localPaymentBreakdown ?? []) map[r.key] = r.amount;
    return map;
  }, [report]);
  // Ödeme defteri satırları — yalnızca kendi (yerel) tahsilatlar. Trendyol ayrı
  // kartta tam dökümüyle gösterilir, defteride karışmaz.
  const methodRows = useMemo(
    () => buildMethodRows(report?.localPaymentBreakdown ?? []),
    [report],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              Gün Sonu Raporu
              {closed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Lock className="size-3" />
                  Kapatıldı
                </span>
              )}
              {report && <ComparisonBadge comparison={comparison} current={report.totalRevenue} />}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {closed && closedAt
                ? `Bu gün donduruldu · ${new Date(closedAt).toLocaleString("tr-TR")}`
                : "Trendyol hakedişi, kapıda tahsilat ve kasa sayımı — fiş olarak yazdırılabilir"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={isLoading}
              className="gap-1.5"
            >
              <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Yenile</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={closeDay}
              disabled={isLoading || isClosing || !report || report.packageCount === 0}
              className="gap-1.5"
            >
              <LockKeyhole className={cn("size-3.5", isClosing && "animate-pulse")} />
              {closed ? "Yeniden Kapat" : "Günü Kapat"}
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={isLoading || !report || report.packageCount === 0}
              className="gap-1.5"
            >
              <Printer className="size-3.5" />
              Fiş Yazdır
            </Button>
          </div>
        </header>

        {isLoading || !report ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Skeleton className="h-96 w-full rounded-xl lg:col-span-2" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        ) : (
          <>
            {/* Para akışı — Trendyol + kendi ödemeler solda, kasa sayımı sağda */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-4 lg:col-span-2">
                {report.trendyol && <TrendyolEarningsCard trendyol={report.trendyol} />}
                <PaymentLedger rows={methodRows} onSelect={setDrillMethod} />
              </div>
              <div className="lg:col-span-1">
                <CashCountCard
                  cashValue={cashCounted}
                  cardValue={cardCounted}
                  ibanValue={ibanCounted}
                  ticketValue={ticketCounted}
                  onCashChange={setCashCounted}
                  onCardChange={setCardCounted}
                  onIbanChange={setIbanCounted}
                  onTicketChange={setTicketCounted}
                  localPayments={localPayments}
                  openAmount={report.openAmount}
                  openCount={report.openCount}
                  corporateTotal={report.corporateTotal}
                  trendyolBankNet={
                    report.trendyol?.available
                      ? report.trendyol.earnings?.totalBankNet ?? null
                      : null
                  }
                  trendyolOnDeliveryNet={
                    report.trendyol?.available
                      ? report.trendyol.earnings?.onDelivery?.bankNet ?? 0
                      : 0
                  }
                  closed={closed}
                  disabled={isLoading || isClosing}
                />
              </div>
            </div>

            {/* Fiş önizleme + kapatılan günler arşivi (ikincil) */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Receipt className="size-4" />
                    Fiş Önizleme
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center">
                  <EndOfDayReceipt
                    report={report}
                    cashCounted={parseAmount(cashCounted)}
                    cardCounted={parseAmount(cardCounted)}
                    ibanCounted={parseAmount(ibanCounted)}
                    ticketCounted={parseAmount(ticketCounted)}
                  />
                </CardContent>
              </Card>
              <ArchiveList
                snapshots={snapshots}
                activeDate={date}
                isLoading={archiveLoading}
                onSelect={setDate}
              />
            </div>
          </>
        )}
      </div>

      {/* Ödeme defteri drill-down — seçili yöntemin kendi siparişleri */}
      <OrdersSheet
        method={drillMethod}
        orders={report?.orders ?? []}
        onClose={() => setDrillMethod(null)}
      />
    </div>
  );
}
