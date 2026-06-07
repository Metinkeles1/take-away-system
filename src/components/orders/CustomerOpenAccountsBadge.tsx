"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { CustomerOpenAccounts } from "@/types";

// Müşterinin AYNI siparişin dışındaki açık hesaplarını gösteren uyarı rozeti.
// Tıklanınca popover'da açık hesapların listesi (no, tarih, tutar) + detay linkleri
// açılır. Kart tıklamasını tetiklememesi için event'ler durdurulur.
export function CustomerOpenAccountsBadge({
  accounts,
}: {
  accounts: CustomerOpenAccounts;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-200 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          title="Bu müşterinin ödenmemiş başka siparişleri var"
        >
          <AlertTriangle className="h-3 w-3" />
          {accounts.count} açık hesap · {formatCurrency(accounts.total)}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        onClick={(e) => e.stopPropagation()}
        className="w-80"
      >
        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="font-semibold text-red-700 dark:text-red-300">
            Ödenmemiş siparişler
          </p>
          <span className="text-xs font-bold tabular-nums text-red-700 dark:text-red-300">
            {formatCurrency(accounts.total)}
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {accounts.orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                prefetch={false}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition hover:bg-muted"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">#{o.orderNumber}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(o.createdAt)}
                  </span>
                </span>
                <span className="flex items-center gap-1 shrink-0 font-semibold tabular-nums">
                  {formatCurrency(o.total)}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/open-accounts"
          prefetch={false}
          className="rounded-md px-2 py-1.5 text-center text-xs font-medium text-amber-700 transition hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
        >
          Tüm açık hesapları gör →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
