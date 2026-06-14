"use client";

import { memo } from "react";
import type {
  Order,
  OrderStatus,
  PaymentMethod,
  MealCardBrand,
  PaymentInfo,
} from "@/types";
import OrderStatusCard from "./OrderStatusCard";
import OrderCourierCard from "./OrderCourierCard";
import OrderItemsCard from "./OrderItemsCard";
import CustomerInfoCard from "./CustomerInfoCard";
import PaymentCard from "./PaymentCard";
import OpenAccountCard from "./OpenAccountCard";
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
  onCollect: (payment: PaymentInfo, amount: number, note?: string) => Promise<void>;
  onToggleOpen: (open: boolean) => Promise<void>;
  onCourierChange: (courier: string | null) => void;
}

const OrderDetailsContent = memo(function OrderDetailsContent({
  order,
  onStatusChange,
  onPaymentUpdate,
  onCollect,
  onToggleOpen,
  onCourierChange,
}: Props) {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide pt-px px-px pb-4 space-y-4">
      <OrderStatusCard status={order.status} onStatusChange={onStatusChange} />

      <OrderCourierCard courier={order.courier} onAssign={onCourierChange} />

      <OrderItemsCard
        items={order.items}
        subtotal={order.subtotal}
        total={order.total}
      />

      <CustomerInfoCard customer={order.customer} />

      {/* Açık hesap yalnızca manuel siparişlerde (veya zaten açıksa tahsilat için) */}
      {(!order.source ||
        order.source === "manual" ||
        order.paymentStatus === "open") && (
        <OpenAccountCard
          order={order}
          onCollect={onCollect}
          onToggleOpen={onToggleOpen}
        />
      )}

      <PaymentCard payment={order.payment} onPaymentUpdate={onPaymentUpdate} />

      <OrderNotesCard notes={order.notes} />
    </div>
  );
});

export default OrderDetailsContent;
