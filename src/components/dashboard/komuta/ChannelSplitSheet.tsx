"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrencyShort } from "@/lib/utils";
import {
  getKomutaPeriodOrders,
  type KomutaOrderRow,
} from "@/actions/komutaOverview";
import { type PaymentKey } from "@/actions/dashboardOverview";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";

export interface SplitSide {
  value: string;
  raw: number;
}
export interface SplitBrand {
  label: string;
  amount: string;
  own: number;
  trendyol: number;
}
export interface OrdersQuery {
  period: DashboardPeriod;
  channel: OrderSource | "all";
  dayOffset: number;
  method?: PaymentKey; // ödeme yöntemine göre
  productName?: string; // ürüne göre
  district?: string; // bölgeye göre
  phone?: string; // kendi müşteriye göre
  trendyolId?: string; // Trendyol müşteriye göre
}
export interface ChannelSplitData {
  title: string;
  subtitle: string;
  own: SplitSide;
  trendyol: SplitSide;
  brands?: SplitBrand[];
  /** Verilirse o ödeme yönteminin siparişleri listelenir (tıkla → detay). */
  ordersQuery?: OrdersQuery;
}

export function ChannelSplitSheet({
  data,
  onClose,
}: {
  data: ChannelSplitData | null;
  onClose: () => void;
}) {
  const total = data ? data.own.raw + data.trendyol.raw : 0;
  const ownPct = total > 0 ? (data!.own.raw / total) * 100 : 0;
  const tyPct = total > 0 ? (data!.trendyol.raw / total) * 100 : 0;

  return (
    <Sheet open={data != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{data?.title}</SheetTitle>
          <SheetDescription className="tabular-nums">{data?.subtitle}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kanal Kırılımı
          </p>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-blue-500" /> Kendi Sipariş
              </span>
              <span className="font-medium tabular-nums">{data?.own.value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${ownPct}%` }} />
            </div>
            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">%{Math.round(ownPct)}</p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-orange-500" /> Trendyol
              </span>
              <span className="font-medium tabular-nums">{data?.trendyol.value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${tyPct}%` }} />
            </div>
            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">%{Math.round(tyPct)}</p>
          </div>

          {/* Yemek kartı marka kırılımı */}
          {data?.brands && data.brands.length > 0 && (
            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Marka Bazında
              </p>
              <ul className="space-y-2">
                {data.brands.map((b) => (
                  <li key={b.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{b.label}</span>
                      <span className="flex shrink-0 gap-1 text-[10px]">
                        {b.own > 0 && (
                          <span className="rounded bg-blue-50 px-1 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            Kendi
                          </span>
                        )}
                        {b.trendyol > 0 && (
                          <span className="rounded bg-orange-50 px-1 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                            TY
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{b.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bu yöntemin siparişleri */}
          {data?.ordersQuery && <OrdersList query={data.ordersQuery} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OrdersList({ query }: { query: OrdersQuery }) {
  const [rows, setRows] = useState<KomutaOrderRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    getKomutaPeriodOrders(query.period, query.channel, query.dayOffset, {
      method: query.method,
      productName: query.productName,
      district: query.district,
      phone: query.phone,
      trendyolId: query.trendyolId,
    }).then((r) => {
      if (alive) setRows(r.filter((o) => !o.status.toLowerCase().includes("cancel")));
    });
    return () => {
      alive = false;
    };
  }, [query.period, query.channel, query.dayOffset, query.method, query.productName, query.district, query.phone, query.trendyolId]);

  return (
    <div className="border-t pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Siparişler {rows && `(${rows.length})`}
      </p>
      {rows === null ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Bu yöntemle sipariş yok.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((o, i) => {
            const inner = (
              <>
                <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">{o.time}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    o.channel === "trendyol"
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                  )}
                >
                  {o.channel === "trendyol" ? "TY" : "Kendi"}
                </span>
                <span className="shrink-0 text-sm font-semibold">#{o.orderNumber}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {o.customerName}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatCurrencyShort(o.total)}
                </span>
              </>
            );
            return (
              <li key={o.id ?? `ty-${i}`}>
                {o.id ? (
                  <Link
                    href={`/orders/${o.id}`}
                    className="flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-accent"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-lg border p-2.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
