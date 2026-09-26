"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyShort } from "@/lib/utils";
import { KomutaOrderRowItem } from "./KomutaOrderRowItem";
import { TrendyolOrderSheet } from "./TrendyolOrderSheet";
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

// KPI → sipariş listesi. Kendi (DB) + Trendyol (arşiv) birlikte, kanal rozetli;
// Trendyol satırı tıklanınca arşiv detay paneli açılır.
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
  const [tyOrder, setTyOrder] = useState<string | null>(null);

  return (
    <>
      <TrendyolOrderSheet orderNumber={tyOrder} onClose={() => setTyOrder(null)} />
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
            {active.map((r, i) => (
              <li key={r.id ?? `ty-${r.orderNumber}-${i}`}>
                <KomutaOrderRowItem
                  row={r}
                  variant="line"
                  showDate={period !== "day"}
                  onTrendyolClick={setTyOrder}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
