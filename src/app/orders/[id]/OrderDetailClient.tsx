"use client";

import { useRef, useCallback } from "react";
import { useOrderStore } from "@/store/orderStore";
import { useReactToPrint } from "react-to-print";
import type { Order, OrderStatus, PaymentMethod, MealCardBrand } from "@/types";
import { toast } from "sonner";
import {
  OrderDetailHeader,
  OrderDetailsContent,
  ReceiptPreview,
} from "@/components/orders/detail";


interface Props {
  initialOrder: Order;
}

export default function OrderDetailClient({ initialOrder }: Props) {
  const { updateOrderStatus, updateOrderPayment, orders } = useOrderStore();
  const receiptRef = useRef<HTMLDivElement>(null);

  // Store'da varsa güncel hali, yoksa server'dan gelen initial veriyi kullan
  const order = orders.find((o) => o.id === initialOrder.id) ?? initialOrder;

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Siparis-${order.orderNumber}`,
  });

  const handleStatusChange = useCallback(
    (status: OrderStatus) => {
      updateOrderStatus(order.id, status);
      toast.success("Durum güncellendi");
    },
    [order.id, updateOrderStatus]
  );

  const handlePaymentUpdate = useCallback(
    async (newPayment: {
      method: PaymentMethod;
      mealCardBrand?: MealCardBrand;
      ibanName?: string;
      ibanNumber?: string;
    }) => {
      await updateOrderPayment(order.id, newPayment);
    },
    [order.id, updateOrderPayment]
  );

  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-4 pb-4 overflow-hidden">
      <OrderDetailHeader order={order} onPrint={() => handlePrint()} />

      {/* İki sütun: Sol scroll, Sağ fiş sabit */}
      <div className="flex-1 min-h-0 flex gap-6">
        <OrderDetailsContent
          order={order}
          onStatusChange={handleStatusChange}
          onPaymentUpdate={handlePaymentUpdate}
        />

        <ReceiptPreview ref={receiptRef} order={order} onPrint={() => handlePrint()} />
      </div>
    </main>
  );
}
