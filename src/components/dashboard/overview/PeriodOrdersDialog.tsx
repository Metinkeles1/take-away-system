"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_CONFIG } from "@/lib/orderStatus";
import {
  getPeriodOrders,
  type PaymentKey,
  type PeriodOrderRow,
} from "@/actions/dashboardOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource, type OrderStatus } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  period: DashboardPeriod;
  source: OrderSource | "all";
  dayOffset: number;
  /** Verilirse sadece o ödeme yöntemi listelenir. */
  paymentMethod?: PaymentKey;
}

// KPI kartına tıklayınca açılan sipariş listesi — tutar + net + ödeme + bölge.
export function PeriodOrdersDialog({
  open,
  onOpenChange,
  title,
  period,
  source,
  dayOffset,
  paymentMethod,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {/* İçerik sadece açıkken mount edilir → her açılışta taze yükleme. */}
        {open && (
          <OrdersBody
            title={title}
            period={period}
            source={source}
            dayOffset={dayOffset}
            paymentMethod={paymentMethod}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OrdersBody({
  title,
  period,
  source,
  dayOffset,
  paymentMethod,
}: Omit<Props, "open" | "onOpenChange">) {
  const [rows, setRows] = useState<PeriodOrderRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    getPeriodOrders(period, source, dayOffset, paymentMethod).then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, [period, source, dayOffset, paymentMethod]);

  const active = (rows ?? []).filter((r) => r.status !== "cancelled");
  const totalSum = active.reduce((s, r) => s + r.total, 0);
  const netSum = active.reduce((s, r) => s + r.net, 0);

  return (
    <>
      <DialogHeader className="border-b p-4">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {rows === null
            ? "Yükleniyor…"
            : `${active.length} sipariş · ${formatCurrency(totalSum)} ciro · ${formatCurrency(netSum)} net`}
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[60vh] overflow-y-auto">
        {rows === null ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Bu dönemde sipariş yok.
          </p>
        ) : (
          <ul className="divide-y">
            {active.map((r) => {
              const config = ORDER_STATUS_CONFIG[r.status as OrderStatus];
              return (
                <li key={r.id}>
                  <Link
                    href={`/orders/${r.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {r.time}
                    </span>
                    <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">
                      #{r.orderNumber}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.customerName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.paymentLabel}
                        {r.district ? ` · ${r.district}` : ""}
                      </p>
                    </div>
                    {config && (
                      <span
                        className={cn(
                          "hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline",
                          config.color,
                        )}
                      >
                        {config.label}
                      </span>
                    )}
                    <div className="w-24 shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(r.total)}
                      </p>
                      <p className="text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                        net {formatCurrency(r.net)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
