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
import { cn, formatCurrencyShort } from "@/lib/utils";
import {
  getKomutaPeriodOrders,
  type KomutaOrderRow,
} from "@/actions/komutaOverview";
import { type PaymentKey } from "@/actions/dashboardOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  period: DashboardPeriod;
  channel: OrderSource | "all";
  dayOffset: number;
  paymentMethod?: PaymentKey;
}

// KPI → sipariş listesi. Kendi (DB) + Trendyol (API) birlikte, kanal rozetli.
export function KomutaOrdersDialog({
  open,
  onOpenChange,
  title,
  period,
  channel,
  dayOffset,
  paymentMethod,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {open && (
          <Body
            title={title}
            period={period}
            channel={channel}
            dayOffset={dayOffset}
            paymentMethod={paymentMethod}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  title,
  period,
  channel,
  dayOffset,
  paymentMethod,
}: Omit<Props, "open" | "onOpenChange">) {
  const [rows, setRows] = useState<KomutaOrderRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    getKomutaPeriodOrders(period, channel, dayOffset, { method: paymentMethod }).then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, [period, channel, dayOffset, paymentMethod]);

  const active = (rows ?? []).filter((r) => !r.status.toLowerCase().includes("cancel"));
  const totalSum = active.reduce((s, r) => s + r.total, 0);
  const ownCount = active.filter((r) => r.channel === "own").length;
  const tyCount = active.filter((r) => r.channel === "trendyol").length;

  return (
    <>
      <DialogHeader className="border-b p-4">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {rows === null
            ? "Yükleniyor…"
            : `${active.length} sipariş · ${formatCurrencyShort(totalSum)} ciro · Kendi ${ownCount} · Trendyol ${tyCount}`}
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
          <p className="p-10 text-center text-sm text-muted-foreground">Bu dönemde sipariş yok.</p>
        ) : (
          <ul className="divide-y">
            {active.map((r, i) => {
              const inner = (
                <>
                  <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {r.time}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                      r.channel === "trendyol"
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                    )}
                  >
                    {r.channel === "trendyol" ? "TY" : "Kendi"}
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
                  <div className="w-24 shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatCurrencyShort(r.total)}</p>
                    {r.net > 0 && (
                      <p className="text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                        net {formatCurrencyShort(r.net)}
                      </p>
                    )}
                  </div>
                </>
              );
              return (
                <li key={r.id ?? `ty-${i}`}>
                  {r.id ? (
                    <Link
                      href={`/orders/${r.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
