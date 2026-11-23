"use client";

import { useMemo, useState } from "react";
import { CalendarRange, ChevronDown, ChevronRight } from "lucide-react";

import { type Voucher } from "@/types";
import { cn, formatCurrency } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { groupVouchersByMonth } from "@/components/receipt/corporateReceiptKit";

/**
 * Görünüm birden çok aya yayıldığında (Tüm Dönemler / Tüm Açık Hesap / tarih
 * aralığı) ay ay döküm: fiş sayısı, toplam, kalan. Satıra tıklayınca o aya geçer.
 * Tek ay varsa hiç gösterilmez (üstteki istatistik kartları zaten aynı bilgiyi verir).
 */
export function MonthlySummary({
  vouchers,
  onSelectMonth,
}: {
  vouchers: Voucher[];
  onSelectMonth: (period: string) => void;
}) {
  const [open, setOpen] = useState(true);
  // Yeni ay üstte: en güncel dönem önce görülsün.
  const months = useMemo(
    () => groupVouchersByMonth(vouchers).reverse(),
    [vouchers],
  );

  if (months.length < 2) return null;

  return (
    <div className="mb-3 shrink-0 rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
        aria-expanded={open}
      >
        <CalendarRange className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
        Aylık Özet
        <span className="text-xs font-normal text-muted-foreground">
          {months.length} ay
        </span>
        {open ? (
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="max-h-56 overflow-y-auto border-t">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Ay</th>
                <th className="px-2 py-1.5 text-right font-medium">Fiş</th>
                <th className="px-2 py-1.5 text-right font-medium">Toplam</th>
                <th className="px-3 py-1.5 text-right font-medium">Kalan</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const settled = m.unpaid <= 0.005;
                return (
                  <tr
                    key={m.period}
                    onClick={() => onSelectMonth(m.period)}
                    className="cursor-pointer border-t transition-colors hover:bg-muted/50"
                    title={`${formatPeriodLabel(m.period)} dönemine git`}
                  >
                    <td className="px-3 py-1.5 font-medium">
                      {formatPeriodLabel(m.period)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {m.count}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCurrency(m.total)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right tabular-nums",
                        settled
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "font-medium text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {settled ? "Ödendi" : formatCurrency(m.unpaid)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
