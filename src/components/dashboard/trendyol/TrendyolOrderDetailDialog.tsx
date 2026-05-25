"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatPhone } from "@/lib/utils";
import { type TrendyolRecentOrder } from "@/actions/trendyolDashboard";
import {
  MapPin,
  Phone,
  StickyNote,
  Receipt,
  Truck,
  Store,
  ShoppingBag,
  Calendar,
} from "lucide-react";

interface Props {
  order: TrendyolRecentOrder | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  Created: {
    label: "Yeni",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  },
  Picking: {
    label: "Kabul Edildi",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  },
  Invoiced: {
    label: "Hazırlandı",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  },
  Shipped: {
    label: "Yolda",
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  },
  Delivered: {
    label: "Teslim Edildi",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  Cancelled: {
    label: "İptal",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  },
  UnSupplied: {
    label: "Karşılanamadı",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  },
};

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TrendyolOrderDetailDialog({ order, onClose }: Props) {
  const status = order ? STATUS_LABEL[order.status] : null;
  // Eski cache'lenmiş yanıtlarda lines undefined olabilir — defansif default.
  const lines = order?.lines ?? [];
  const itemsTotal = lines.reduce((s, l) => s + l.totalPrice, 0);
  const deliveryFee = order ? Math.max(0, order.total - itemsTotal) : 0;

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>#{order?.orderNumber}</span>
            {status && (
              <Badge
                variant="outline"
                className={`border-transparent ${status.className}`}
              >
                {status.label}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              {order && formatDateTime(order.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              {order?.deliveryType === "STORE" ? (
                <>
                  <Store className="size-3" />
                  Mağazadan
                </>
              ) : (
                <>
                  <Truck className="size-3" />
                  Adrese teslim
                </>
              )}
            </span>
            <span className="text-muted-foreground">
              Trendyol · {order?.paymentMethod}
            </span>
          </DialogDescription>
        </DialogHeader>

        {order && (
          <div className="space-y-4">
            {/* Müşteri */}
            <section className="rounded-md border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Müşteri
              </h3>
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">{order.customerName}</p>
                {order.customerPhone && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" />
                    <a
                      href={`tel:${order.customerPhone}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {formatPhone(order.customerPhone)}
                    </a>
                  </p>
                )}
              </div>
            </section>

            {/* Adres */}
            {order.address && (
              <section className="rounded-md border bg-card p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MapPin className="size-3" />
                  Teslimat Adresi
                </h3>
                <div className="space-y-0.5 text-sm">
                  <p>{order.address.addressLine}</p>
                  {(order.address.neighborhood ||
                    order.address.district ||
                    order.address.city) && (
                    <p className="text-muted-foreground">
                      {[
                        order.address.neighborhood,
                        order.address.district,
                        order.address.city,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {order.address.description && (
                    <p className="text-[11px] italic text-muted-foreground">
                      &ldquo;{order.address.description}&rdquo;
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Müşteri notu */}
            {order.customerNote && (
              <section className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  <StickyNote className="size-3" />
                  Müşteri Notu
                </h3>
                <p className="text-sm">{order.customerNote}</p>
              </section>
            )}

            {/* Ürünler */}
            <section className="rounded-md border bg-card">
              <h3 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ShoppingBag className="size-3" />
                  Ürünler ({lines.length})
                </span>
              </h3>
              <ul className="divide-y">
                {lines.map((line, idx) => (
                  <li key={idx} className="space-y-1 px-3 py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          <span className="mr-1.5 tabular-nums text-muted-foreground">
                            ×{line.quantity}
                          </span>
                          {line.name}
                        </p>
                        {line.modifiers.length > 0 && (
                          <ul className="mt-0.5 ml-4 space-y-0.5 text-[11px] text-muted-foreground">
                            {line.modifiers.map((m, j) => (
                              <li key={j} className="flex justify-between gap-2">
                                <span>+ {m.name}</span>
                                {m.price > 0 && (
                                  <span className="tabular-nums">
                                    {formatCurrency(m.price)}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {line.description && (
                          <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                            {line.description}
                          </p>
                        )}
                        {line.cancelledCount > 0 && (
                          <p className="mt-0.5 text-[11px] font-medium text-rose-600">
                            {line.cancelledCount} adet iptal
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-right font-semibold tabular-nums">
                        {formatCurrency(line.totalPrice)}
                      </span>
                    </div>
                  </li>
                ))}
                {lines.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Bu sipariş için ürün bilgisi yok
                  </li>
                )}
              </ul>
            </section>

            {/* Toplam */}
            <section className="rounded-md border bg-card p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Receipt className="size-3" />
                Ödeme
              </h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ara toplam</span>
                  <span className="tabular-nums">{formatCurrency(itemsTotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Teslimat / diğer</span>
                    <span className="tabular-nums">
                      {formatCurrency(deliveryFee)}
                    </span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Toplam</span>
                  <span className="tabular-nums">{formatCurrency(order.total)}</span>
                </div>
                {order.netRevenue !== undefined && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Net hakediş</span>
                    <span className="tabular-nums">
                      {formatCurrency(order.netRevenue)}
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
