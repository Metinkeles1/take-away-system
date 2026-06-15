"use client";

import { memo } from "react";
import type {
  Order,
  OrderStatus,
  PaymentMethod,
  MealCardBrand,
  PaymentInfo,
} from "@/types";
import OrderControlsCard from "./OrderControlsCard";
import OrderItemsCard from "./OrderItemsCard";
import CustomerInfoCard from "./CustomerInfoCard";
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
      {/* Durum + Kurye + Ödeme — tek kompakt şerit */}
      <OrderControlsCard
        order={order}
        onStatusChange={onStatusChange}
        onCourierChange={onCourierChange}
        onPaymentUpdate={onPaymentUpdate}
      />

      {/* Açık hesap uyarısı/tahsilat — yalnızca manuel siparişlerde (veya açıksa) */}
      {(!order.source ||
        order.source === "manual" ||
        order.paymentStatus === "open") && (
        <OpenAccountCard
          order={order}
          onCollect={onCollect}
          onToggleOpen={onToggleOpen}
        />
      )}

      <OrderItemsCard
        items={order.items}
        subtotal={order.subtotal}
        total={order.total}
      />

      <CustomerInfoCard customer={order.customer} />

      <OrderNotesCard notes={order.notes} />
    </div>
  );
});

export default OrderDetailsContent;
