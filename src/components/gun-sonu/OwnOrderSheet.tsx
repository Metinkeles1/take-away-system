"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bike, Timer, Wallet } from "lucide-react";

import { getOrderById } from "@/actions/orders";
import type { Order } from "@/types";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CustomerInfoCard, OrderItemsCard } from "@/components/orders/detail";
import { ORDER_STATUS_CONFIG } from "@/lib/orderStatus";
import { cn, formatCurrency } from "@/lib/utils";

import { METHOD_META, fmtMin } from "./meta";

// Kendi siparişin özeti — Gün Sonu'ndan ayrılmadan yan panelde. Durum değiştirme,
// tahsilat gibi işlemler için "Sipariş sayfasını aç" (filtre adres çubuğunda
// tutulduğu için geri gelince gün ve seçim yerinde kalır).
export function OwnOrderSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [fetched, setFetched] = useState<{ id: string; order: Order | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getOrderById(id).then(
      (order) => alive && setFetched({ id, order }),
      () => alive && setFetched({ id, order: null }),
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const order = fetched?.id === id ? fetched.order : undefined;
  const status = order ? ORDER_STATUS_CONFIG[order.status] : null;
  const method = order ? METHOD_META[order.payment.method] ?? METHOD_META.other : null;

  return (
    <Sheet open={id != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2">
            {order ? `#${order.orderNumber}` : "Sipariş"}
            {status && (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", status.color)}>{status.label}</span>
            )}
          </SheetTitle>
          <SheetDescription>
            {order
              ? new Date(order.createdAt).toLocaleString("tr-TR", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Istanbul",
                })
              : "Yükleniyor…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {order === undefined ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-28 w-full" />
            </>
          ) : order === null ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Sipariş bulunamadı</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Fact icon={Wallet} label="Ödeme">
                  {order.payment.split && order.payment.split.length > 1 ? (
                    <span className="block text-xs">
                      {order.payment.split
                        .map((p) => `${(METHOD_META[p.method] ?? METHOD_META.other).short} ${formatCurrency(p.amount)}`)
                        .join(" + ")}
                    </span>
                  ) : (
                    <>
                      {method?.short}
                      {order.payment.mealCardBrand && ` · ${order.payment.mealCardBrand}`}
                    </>
                  )}
                  {order.paymentStatus === "open" && (
                    <span className="block text-[11px] font-medium text-amber-600 dark:text-amber-400">Açık hesap</span>
                  )}
                </Fact>
                <Fact icon={Bike} label="Kurye">
                  {order.courier ?? "—"}
                </Fact>
                <Fact icon={Timer} label="Teslim">
                  {fmtMin(order.deliveryDurationMin ?? null)}
                </Fact>
              </div>
              <OrderItemsCard
                items={order.items}
                subtotal={order.subtotal}
                discount={order.discount}
                total={order.total}
              />
              <CustomerInfoCard customer={order.customer} />
            </>
          )}
        </div>

        {id && (
          <div className="border-t p-3">
            <Button asChild variant="outline" className="w-full gap-1.5">
              <Link href={`/orders/${id}`}>
                Sipariş sayfasını aç <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold">{children}</p>
    </div>
  );
}
