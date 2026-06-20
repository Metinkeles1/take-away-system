"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_CONFIG } from "@/lib/orderStatus";
import { type LiveOpsOrder, type OperationalSnapshot } from "@/actions/dashboard";
import { type OrderStatus } from "@/types";

interface Props {
  snapshot: OperationalSnapshot | null;
  isLoading: boolean;
}

// Açık siparişler — geciken üstte, yaşı dakikayla. Tıkla → sipariş detayı.
export function OverviewActiveOrders({ snapshot, isLoading }: Props) {
  const orders = snapshot?.openOrders ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Açık Siparişler</CardTitle>
        <Link
          href="/orders"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Tümü →
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <CheckCircle2 className="mb-2 size-10 opacity-30" />
            <p className="text-sm">Açık sipariş yok</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {orders.slice(0, 8).map((o) => (
              <Row key={o.id} order={o} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ order }: { order: LiveOpsOrder }) {
  const config = ORDER_STATUS_CONFIG[order.status as OrderStatus];
  return (
    <li>
      <Link
        href={`/orders/${order.id}`}
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border p-2.5 transition-colors hover:bg-accent",
          order.sla === "critical" &&
            "border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30",
          order.sla === "warn" &&
            "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {order.source === "trendyol" && (
            <span className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-emerald-600 text-[9px] font-black text-white">
              T
            </span>
          )}
          <span className="font-semibold">#{order.orderNumber}</span>
          <span className="truncate text-muted-foreground">{order.customerName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {config && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${config.color}`}
            >
              {config.label}
            </span>
          )}
          <span
            className={cn(
              "w-12 text-right text-xs font-semibold tabular-nums",
              order.sla === "critical"
                ? "text-rose-600 dark:text-rose-400"
                : order.sla === "warn"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
            )}
          >
            {order.ageMin} dk
          </span>
          <span className="hidden w-20 text-right text-sm font-medium tabular-nums sm:inline">
            {formatCurrency(order.total)}
          </span>
        </div>
      </Link>
    </li>
  );
}
