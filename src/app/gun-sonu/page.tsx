"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Printer,
  RefreshCw,
  Package,
  Wallet,
  Receipt,
  Ban,
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
} from "lucide-react";
import Link from "next/link";
import {
  getEndOfDay,
  saveEndOfDaySnapshot,
  listEndOfDaySnapshots,
  type EndOfDayReport,
  type EndOfDaySnapshotSummary,
  type EndOfDayTrendyol,
} from "@/actions/endOfDay";
import EndOfDayReceipt from "@/components/receipt/EndOfDayReceipt";
import { formatCurrency, cn } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Nakit",
  card: "Kredi/Banka Kartı",
  online: "Online Ödeme",
  meal_card: "Yemek Kartı",
  iban: "IBAN / Havale",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Telefon / Manuel",
  trendyol: "Trendyol",
  getir: "Getir",
  yemeksepeti: "Yemeksepeti",
};

const SOURCE_DOT: Record<string, string> = {
  manual: "bg-slate-400",
  trendyol: "bg-orange-500",
  getir: "bg-purple-500",
  yemeksepeti: "bg-pink-500",
};

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

const StatCard = memo(function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", accent)}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
          {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
});

const BreakdownTable = memo(function BreakdownTable({
  title,
  rows,
  labels,
  countHeader,
  total,
  dots,
}: {
  title: string;
  rows: { key: string; count: number; amount: number }[];
  labels: Record<string, string>;
  countHeader: string;
  total: number;
  dots?: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Bu gün için kayıt yok
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-foreground/8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Kalem</th>
                  <th className="px-3 py-2 text-center font-medium">{countHeader}</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {dots && (
                          <span
                            className={cn("size-2 shrink-0 rounded-full", dots[r.key] ?? "bg-slate-400")}
                          />
                        )}
                        {labels[r.key] ?? r.key}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.count}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                      {total > 0 ? `%${Math.round((r.amount / total) * 100)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-3 py-2">Toplam</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {rows.reduce((s, r) => s + r.count, 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(total)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

const CorporateTable = memo(function CorporateTable({
  rows,
  total,
  open,
}: {
  rows: { id: string; name: string; count: number; amount: number; openAmount: number }[];
  total: number;
  open: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-cyan-500" />
          Kurumsal Hesaplar (O Gün Giden)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Bu gün kurumsal fiş kesilmemiş
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-foreground/8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Firma</th>
                  <th className="px-3 py-2 text-center font-medium">Fiş</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  <th className="px-3 py-2 text-right font-medium">Açık</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        href={`/corporate/${r.id}`}
                        className="font-medium text-cyan-600 hover:underline dark:text-cyan-400"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.count}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.openAmount > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {formatCurrency(r.openAmount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-3 py-2">Toplam</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {rows.reduce((s, r) => s + r.count, 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {open > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        {formatCurrency(open)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ── Trendyol hakediş kartı — kredi kartı / yemek kartı / kapıda kırılımı ──────
// "Net Hakediş" = Tutar−Komisyon−İndirim (Trendyol Satıcı Hakediş).
// "Bankaya Yatacak" = yemek kartı/kod ile kalemlerde sağlayıcı %10 da düşülmüş hali.
type TrendyolCat = NonNullable<EndOfDayTrendyol["earnings"]>["creditCard"];

const EarningRow = memo(function EarningRow({
  icon: Icon,
  label,
  cat,
  tag,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  cat: TrendyolCat | undefined;
  tag: "gerçek" | "tahmini";
}) {
  if (!cat || cat.count === 0) return null;
  const hasProviderCut = cat.bankNet < cat.trendyolNet - 0.5;
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {label}
            <span className="rounded bg-muted px-1 py-px text-[10px] font-normal text-muted-foreground">
              {tag}
            </span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground tabular-nums">
            {cat.count} sipariş · brüt {formatCurrency(cat.gross)}
            {hasProviderCut && ` · hakediş ${formatCurrency(cat.trendyolNet)} −%10`}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatCurrency(cat.bankNet)}
      </span>
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
            Trendyol Hakediş
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bike className="size-4 text-orange-500" />
          Trendyol Hakediş
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
          <>
            <p className="mb-1 text-[11px] text-muted-foreground">
              Komisyon ~%{(e.commissionRate * 100).toFixed(1)} (online karttan türetildi) ·
              sadece online tahsilat (kapıda ödeme hariç) · tutarlar bankaya yatacak nettir
            </p>
            <EarningRow icon={CreditCard} label="Kredi Kartı" cat={e.creditCard} tag="gerçek" />
            <EarningRow icon={Receipt} label="Yemek Kartı (Ticket)" cat={e.ticket} tag="tahmini" />

            <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Trendyol Hakediş (komisyon sonrası)</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(e.totalTrendyolNet)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <Landmark className="size-4" />
                  Bankaya Yatacak
                </span>
                <span className="text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {formatCurrency(e.totalBankNet)}
                </span>
              </div>
            </div>
          </>
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
  trendyolBankNet: number | null; // Trendyol'dan bankaya gelen net (otomatik)
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
  // Genel toplam = elle girilen kasa + Trendyol net satış + kurumsal satış.
  const grandTotal = total + (trendyolBankNet ?? 0) + corporateTotal;

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

        {/* Trendyol net satış — bankaya gelen kısım, otomatik çekilir */}
        {trendyolBankNet != null && (
          <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Bike className="size-4 text-orange-500" />
              Trendyol Net Satış
              <span className="text-[11px] font-normal text-muted-foreground">otomatik</span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(trendyolBankNet)}
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

        {/* Genel toplam — kasa + Trendyol + kurumsal (günün tüm net geliri) */}
        {(hasAny || trendyolBankNet != null || corporateTotal > 0.5) && (
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

export default function EndOfDayPage() {
  const [date, setDate] = useState(istanbulToday);
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
  const paymentTotal = useMemo(
    () => report?.paymentBreakdown.reduce((s, r) => s + r.amount, 0) ?? 0,
    [report],
  );
  // Kasa mutabakatı için yöntem bazlı yerel satış (Trendyol hariç). Her kasa
  // alanı, sistemdeki aynı yöntemin yerel satışıyla karşılaştırılır.
  const localPayments = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of report?.localPaymentBreakdown ?? []) map[r.key] = r.amount;
    return map;
  }, [report]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
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
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {closed && closedAt
                ? `Bu gün donduruldu · ${new Date(closedAt).toLocaleString("tr-TR")}`
                : "Seçilen güne ait ödeme ve kanal kırılımı — fiş olarak yazdırılabilir"}
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
              onClick={() => window.print()}
              disabled={isLoading || !report || report.packageCount === 0}
              className="gap-1.5"
            >
              <Printer className="size-3.5" />
              Fiş Yazdır
            </Button>
          </div>
        </header>

        {/* KPI kartları — 2 sıra × 3 (geniş ekranda sıkışmasın) */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {isLoading || !report ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))
          ) : (
            <>
              <StatCard
                icon={Package}
                label="Toplam Paket"
                value={`${report.packageCount}`}
                sub={`Ort. sepet ${formatCurrency(report.avgBasket)}`}
                accent="bg-blue-500/15 text-blue-600 dark:text-blue-400"
              />
              <StatCard
                icon={Wallet}
                label="Toplam Ciro"
                value={formatCurrency(report.totalRevenue + report.corporateTotal)}
                sub={
                  report.corporateTotal > 0
                    ? `+ Kurumsal ${formatCurrency(report.corporateTotal)} dahil`
                    : undefined
                }
                accent="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                icon={Bike}
                label="Trendyol Bankaya Yatacak"
                value={
                  report.trendyol?.available
                    ? formatCurrency(
                        report.trendyol.earnings?.totalBankNet ??
                          report.trendyol.netRevenue,
                      )
                    : "—"
                }
                sub={
                  report.trendyol?.available
                    ? `Hakediş ${formatCurrency(
                        report.trendyol.earnings?.totalTrendyolNet ??
                          report.trendyol.netRevenue,
                      )} · Brüt ${formatCurrency(report.trendyol.revenue)}`
                    : "API'dan okunamadı"
                }
                accent="bg-orange-500/15 text-orange-600 dark:text-orange-400"
              />
              <StatCard
                icon={Receipt}
                label="Açık Hesap"
                value={formatCurrency(report.openAmount)}
                sub={`${report.openCount} sipariş · Tahsil ${formatCurrency(report.paidAmount)}`}
                accent="bg-amber-500/15 text-amber-600 dark:text-amber-400"
              />
              <StatCard
                icon={Building2}
                label="Kurumsal (Bugün)"
                value={formatCurrency(report.corporateTotal)}
                sub={`${report.corporateVoucherCount} fiş · Açık ${formatCurrency(report.corporateOpen)}`}
                accent="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
              />
              <StatCard
                icon={Ban}
                label="İptal Edilen"
                value={`${report.cancelledCount}`}
                accent="bg-rose-500/15 text-rose-600 dark:text-rose-400"
              />
            </>
          )}
        </section>

        {/* Kırılımlar + fiş önizleme */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {isLoading || !report ? (
              <>
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </>
            ) : (
              <>
                {report.trendyol && <TrendyolEarningsCard trendyol={report.trendyol} />}
                <BreakdownTable
                  title="Ödeme Yöntemine Göre"
                  rows={report.paymentBreakdown}
                  labels={PAYMENT_LABELS}
                  countHeader="Adet"
                  total={paymentTotal}
                />
                <BreakdownTable
                  title="Kanala Göre (Ticket)"
                  rows={report.sourceBreakdown}
                  labels={SOURCE_LABELS}
                  countHeader="Paket"
                  total={report.totalRevenue}
                  dots={SOURCE_DOT}
                />
                <CorporateTable
                  rows={report.corporateBreakdown}
                  total={report.corporateTotal}
                  open={report.corporateOpen}
                />
              </>
            )}
          </div>

          {/* Kasa sayımı + fiş önizleme + arşiv — sağ kolon */}
          <div className="flex flex-col gap-4 lg:col-span-1">
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
              openAmount={report?.openAmount ?? 0}
              openCount={report?.openCount ?? 0}
              corporateTotal={report?.corporateTotal ?? 0}
              trendyolBankNet={
                report?.trendyol?.available
                  ? report.trendyol.earnings?.totalBankNet ?? null
                  : null
              }
              closed={closed}
              disabled={isLoading || isClosing}
            />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Receipt className="size-4" />
                  Fiş Önizleme
                </CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                {isLoading || !report ? (
                  <Skeleton className="h-96 w-[72mm] rounded-md" />
                ) : (
                  <EndOfDayReceipt
                    report={report}
                    cashCounted={parseAmount(cashCounted)}
                    cardCounted={parseAmount(cardCounted)}
                    ibanCounted={parseAmount(ibanCounted)}
                    ticketCounted={parseAmount(ticketCounted)}
                  />
                )}
              </CardContent>
            </Card>

            <ArchiveList
              snapshots={snapshots}
              activeDate={date}
              isLoading={archiveLoading}
              onSelect={setDate}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
