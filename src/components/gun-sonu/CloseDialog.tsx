"use client";

import { LockKeyhole, Plus, Printer, Wallet } from "lucide-react";

import type { EndOfDayReport } from "@/actions/endOfDay";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EndOfDayReceipt from "@/components/receipt/EndOfDayReceipt";

import { CashCountCard } from "./CashCountCard";
import { formatDayTR, parseAmount } from "./meta";

export interface CashCountState {
  show: boolean;
  cash: string;
  card: string;
  iban: string;
  ticket: string;
}

export const EMPTY_COUNT: CashCountState = { show: false, cash: "", card: "", iban: "", ticket: "" };

// Elle sayım yalnız bölüm açıkken geçerli (kapalıysa "saymadan kapat").
export function countedValues(c: CashCountState) {
  const v = (s: string) => (c.show ? parseAmount(s) : null);
  return { cash: v(c.cash), card: v(c.card), iban: v(c.iban), ticket: v(c.ticket) };
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  report: EndOfDayReport;
  closed: boolean;
  busy: boolean;
  count: CashCountState;
  onCountChange: (c: CashCountState) => void;
  onConfirm: (print: boolean) => void;
}

// Günü kapatma akışı: isteğe bağlı kasa sayımı → fiş önizleme → kapat (+yazdır).
export function CloseDialog({ open, onOpenChange, report, closed, busy, count, onCountChange, onConfirm }: Props) {
  const localPayments: Record<string, number> = {};
  for (const r of report.localPaymentBreakdown) localPayments[r.key] = r.amount;
  const c = countedValues(count);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Başlık ve düğmeler sabit, ortası kayar — telefonda adres çubuğu/alt menü
          görünür alanı daraltınca düğmeler ekran dışına taşmasın (dvh). */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="size-4" />
            {closed ? "Günü Yeniden Kapat" : "Günü Kapat"}
          </DialogTitle>
          <DialogDescription>
            {formatDayTR(report.date)} · rakamlar dondurulur
            {closed && ", eski kayıt güncel rakamlarla değiştirilir"}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overscroll-contain p-4 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            {count.show ? (
              <CashCountCard
                cashValue={count.cash}
                cardValue={count.card}
                ibanValue={count.iban}
                ticketValue={count.ticket}
                onCashChange={(v) => onCountChange({ ...count, cash: v })}
                onCardChange={(v) => onCountChange({ ...count, card: v })}
                onIbanChange={(v) => onCountChange({ ...count, iban: v })}
                onTicketChange={(v) => onCountChange({ ...count, ticket: v })}
                localPayments={localPayments}
                closed={closed}
                disabled={busy}
                onRemove={() => onCountChange({ ...count, show: false })}
              />
            ) : (
              <button
                type="button"
                onClick={() => onCountChange({ ...count, show: true })}
                className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Plus className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Wallet className="size-3.5 text-muted-foreground" />
                    Kasa sayımı ekle (isteğe bağlı)
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Nakit/kart/IBAN/ticket say, sistemle karşılaştır. Saymadan da kapatabilirsin.
                  </span>
                </span>
              </button>
            )}
          </div>

          {/* Önizleme — baskıda gizli; asıl baskı sayfadaki gizli fişten */}
          <div className="flex justify-center rounded-xl bg-muted/40 p-3 print:hidden">
            <EndOfDayReceipt
              report={report}
              cashCounted={c.cash}
              cardCounted={c.card}
              ibanCounted={c.iban}
              ticketCounted={c.ticket}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end">
          {/* Mobilde Vazgeç yerine sağ üstteki × — iki ana düğme yan yana sığsın */}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="hidden sm:inline-flex">
            Vazgeç
          </Button>
          <Button variant="outline" onClick={() => onConfirm(false)} disabled={busy} className="h-10 gap-1.5 sm:h-8">
            <LockKeyhole className="size-3.5" />
            Kapat
          </Button>
          <Button onClick={() => onConfirm(true)} disabled={busy} className="h-10 gap-1.5 sm:h-8">
            <Printer className="size-3.5" />
            Kapat ve Yazdır
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
