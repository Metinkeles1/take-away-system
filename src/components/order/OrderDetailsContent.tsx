"use client";

import { memo } from "react";
import type { Order, OrderStatus, PaymentMethod, MealCardBrand } from "@/types";
import OrderStatusCard from "./OrderStatusCard";
import OrderItemsCard from "./OrderItemsCard";
import CustomerInfoCard from "./CustomerInfoCard";
import PaymentCard from "./PaymentCard";
import OrderNotesCard from "./OrderNotesCard";

interface Props {
  order: Order;
  onStatusChange: (status: OrderStatus) => void;
  onPaymentUpdate: (newPayment: {
    method: PaymentMethod;
    mealCardBrand?: MealCardBrand;
    ibanName?: string;
    ibanNumber?: string;
  }) => Promise<void>;
}

const OrderDetailsContent = memo(function OrderDetailsContent({
  order,
  onStatusChange,
  onPaymentUpdate,
}: Props) {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide pt-px px-px pb-4 space-y-4">
      <OrderStatusCard status={order.status} onStatusChange={onStatusChange} />

      <OrderItemsCard
        items={order.items}
        subtotal={order.subtotal}
        total={order.total}
      />

      <CustomerInfoCard customer={order.customer} />

      <PaymentCard payment={order.payment} onPaymentUpdate={onPaymentUpdate} />

      <OrderNotesCard notes={order.notes} />
    </div>
  );
});

export default OrderDetailsContent;
