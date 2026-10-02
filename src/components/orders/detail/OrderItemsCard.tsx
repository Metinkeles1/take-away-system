"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import type { Order } from "@/types";
import { memo } from "react";
import { PortionBadge } from "../PortionBadge";
import { ItemOptionChips } from "../ItemOptionChips";
import { orderItemKey, orderItemUnitPrice } from "@/lib/orders/items";

interface Props {
  items: Order["items"];
  subtotal: number;
  total: number;
}

const OrderItemsCard = memo(function OrderItemsCard({
  items,
  subtotal,
  total,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sipariş Kalemleri</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => {
            const key = orderItemKey(item);
            const unitPrice = orderItemUnitPrice(item);
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium text-sm">
                    {item.product.name}
                    {item.portion && <PortionBadge portion={item.portion} />}
                  </p>
                  <ItemOptionChips item={item} className="mt-1" />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {item.quantity} × {formatCurrency(unitPrice)}
                  </span>
                  <span className="font-bold w-20 text-right">
                    {formatCurrency(item.totalPrice)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <Separator className="my-3" />
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Ara Toplam</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-base font-bold">
            <span>Toplam</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default OrderItemsCard;
