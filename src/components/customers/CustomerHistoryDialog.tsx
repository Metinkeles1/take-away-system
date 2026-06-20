import { memo, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCustomerOrderHistory } from "@/actions/customers";
import { ORDER_STATUS_CONFIG } from "@/lib/orderStatus";
import { formatCurrency, formatDate } from "@/lib/utils";
import { type CustomerOrderSummary, type SavedCustomer } from "@/types";
import { Receipt, ShoppingBag } from "lucide-react";

interface CustomerHistoryDialogProps {
  customer: SavedCustomer | null;
  onClose: () => void;
}

export const CustomerHistoryDialog = memo(function CustomerHistoryDialog({
  customer,
  onClose,
}: CustomerHistoryDialogProps) {
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    setIsLoading(true);
    setOrders([]);
    getCustomerOrderHistory(customer.phone)
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {customer?.name} — Sipariş Geçmişi
          </DialogTitle>
          <DialogDescription>
            {customer?.orderCount ?? 0} sipariş kaydı
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ShoppingBag className="mb-3 h-12 w-12 opacity-20" />
              <p className="text-sm">Bu müşteriye ait sipariş bulunamadı</p>
            </div>
          ) : (
            orders.map((order) => {
              const status = ORDER_STATUS_CONFIG[order.status];
              return (
                <div key={order.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-sm">
                        #{order.orderNumber}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {order.paymentStatus === "open" && (
                        <Badge
                          variant="outline"
                          className="text-amber-700 border-amber-300"
                        >
                          Açık hesap
                        </Badge>
                      )}
                      <Badge className={status.color}>{status.label}</Badge>
                    </div>
                  </div>

                  <ul className="mt-2 space-y-0.5">
                    {order.items.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-baseline justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="text-muted-foreground tabular-nums">
                            {item.quantity}×
                          </span>{" "}
                          {item.name}
                          {item.portionLabel && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              ({item.portionLabel})
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                          {formatCurrency(item.totalPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {order.notes && (
                    <p className="mt-2 text-xs text-muted-foreground italic">
                      Not: {order.notes}
                    </p>
                  )}

                  <div className="mt-2 pt-2 border-t flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Toplam</span>
                    <span className="font-semibold text-sm tabular-nums">
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
