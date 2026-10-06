"use client";

import { memo } from "react";
import { ArrowRightLeft, Banknote, Coins, CreditCard, Ticket, Wallet, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";

import { EPSILON, parseAmount } from "./meta";

// Tek kasa alanı — girilen tutar + o yöntemin sistemdeki yerel satışıyla kıyas.
const CashField = memo(function CashField({
  icon: Icon,
  label,
  value,
  systemAmount,
  disabled,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  systemAmount: number; // sistemde bu yöntemle yapılan yerel satış
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const counted = parseAmount(value);
  const d = (counted ?? 0) - systemAmount; // girilen − sistem
  const showCmp = systemAmount > EPSILON || counted != null;
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
                    d < -EPSILON
                      ? "text-rose-600 dark:text-rose-400"
                      : d > EPSILON
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {d < -EPSILON
                    ? `eksik ${formatCurrency(d)}`
                    : d > EPSILON
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
});

// ── Kasa Sayımı — OPSİYONEL. Elle girilen nakit / kredi kartı / IBAN / ticket. ──
// Trendyol HARİÇ kendi tahsilatların. Toplamı, sistemdeki yerel paket cirosuyla
// (yine Trendyol hariç) kıyaslanır → "kasam siparişlerden az mı çok mu" teyidi.
// Gün kapatılınca snapshot'a kaydedilir. Toplam ciroya EKLENMEZ (mükerrer olmaz).
export const CashCountCard = memo(function CashCountCard({
  cashValue,
  cardValue,
  ibanValue,
  ticketValue,
  onCashChange,
  onCardChange,
  onIbanChange,
  onTicketChange,
  localPayments,
  closed,
  disabled,
  onRemove,
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
  closed: boolean;
  disabled: boolean;
  onRemove: () => void;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-emerald-500" />
          Kasa Sayımı
          <span className="text-[11px] font-normal text-muted-foreground">
            Trendyol hariç · opsiyonel
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-normal text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
            Kaldır
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <CashField icon={Banknote} label="Nakit" value={cashValue} onChange={onCashChange} systemAmount={localPayments.cash ?? 0} disabled={disabled} />
        <CashField icon={CreditCard} label="Kredi Kartı (POS)" value={cardValue} onChange={onCardChange} systemAmount={localPayments.card ?? 0} disabled={disabled} />
        <CashField icon={ArrowRightLeft} label="IBAN / Havale" value={ibanValue} onChange={onIbanChange} systemAmount={localPayments.iban ?? 0} disabled={disabled} />
        <CashField icon={Ticket} label="Yemek Kartı (Ticket)" value={ticketValue} onChange={onTicketChange} systemAmount={localPayments.meal_card ?? 0} disabled={disabled} />

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
                diff < -EPSILON
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              <span>{diff < -EPSILON ? "Kasa eksik" : "Kasa farkı (fazla)"}</span>
              <span className="tabular-nums">
                {diff >= 0 ? "+" : ""}
                {formatCurrency(diff)}
              </span>
            </div>
            {diff < -EPSILON && (
              <p className="text-[11px] font-normal text-rose-600/80 dark:text-rose-400/80">
                Kasan sistemdeki siparişlerden az — eksik tahsilat olabilir.
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          {closed
            ? "Kayıtlı. Değiştirip “Yeniden Kapat” ile güncelleyebilirsin."
            : "“Günü Kapat” ile birlikte kaydedilir. Saymadan da günü kapatabilirsin."}
        </p>
      </CardContent>
    </Card>
  );
});
