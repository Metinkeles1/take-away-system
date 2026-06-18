"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useOrderStore } from "@/store/orderStore";
import { useReactToPrint } from "react-to-print";
import { getCustomerOpenAccounts } from "@/actions/orders";
import type {
  CustomerOpenAccounts,
  Order,
  OrderStatus,
  PaymentMethod,
  MealCardBrand,
  PaymentInfo,
} from "@/types";
import { toast } from "sonner";
import {
  OrderDetailHeader,
  OrderDetailsContent,
  ReceiptPreview,
} from "@/components/orders/detail";
import { subscribeOrders } from "@/lib/pusher/client";

interface Props {
  initialOrder: Order;
}

export default function OrderDetailClient({ initialOrder }: Props) {
  const {
    updateOrderStatus,
    updateOrderPayment,
    collectOpenAccount,
    setOrderOpenAccount,
    setOrderCourier,
    orders,
    loadOrders,
  } = useOrderStore();
  const receiptRef = useRef<HTMLDivElement>(null);
  // Fiş önizleme aç/kapa — varsayılan gizli ki içerik tam genişlik alsın. Fiş
  // DOM'da kalır (yalnızca CSS ile gizlenir) → "Fişi Yazdır" her durumda çalışır.
  const [showReceipt, setShowReceipt] = useState(false);

  // Store'da varsa güncel hali, yoksa server'dan gelen initial veriyi kullan
  const order = orders.find((o) => o.id === initialOrder.id) ?? initialOrder;

  // Müşterinin DİĞER ödenmemiş siparişleri — fişte "Eski Açık Hesap" dökümü için.
  // Bu siparişin kendisi açık hesapsa kendini saymamak için id ile filtrelenir.
  // Tahsilat/ödeme değişince yeniden çekilsin diye paymentStatus de bağımlılıkta.
  const [openAccounts, setOpenAccounts] = useState<CustomerOpenAccounts | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getCustomerOpenAccounts(order.customer.phone ?? "");
      if (!alive) return;
      const others = res?.orders.filter((o) => o.id !== order.id) ?? [];
      setOpenAccounts(
        others.length
          ? {
              count: others.length,
              total: others.reduce((s, o) => s + o.total, 0),
              orders: others,
            }
          : null,
      );
    })();
    return () => {
      alive = false;
    };
  }, [order.id, order.customer.phone, order.paymentStatus]);

  // Gerçek zamanlı: kurye teslim edince / durum değişince bu sayfa da anında
  // güncellensin. (Liste sayfasında vardı, detayda yoktu — teslim edilen sipariş
  // burada eski statüde kalıyordu.) Pusher asıl mekanizma; sekmeye geri dönünce
  // tek sefer yenileme ise arka plandayken kaçmış olabilecek olayı toparlar.
  useEffect(() => {
    const onFocus = () => void loadOrders();
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeOrders(() => void loadOrders());
    return () => {
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleCollect = useCallback(
    async (payment: PaymentInfo, amount: number, note?: string) => {
      await collectOpenAccount(order.id, payment, amount, note);
    },
    [order.id, collectOpenAccount]
  );

  const handleToggleOpen = useCallback(
    async (open: boolean) => {
      await setOrderOpenAccount(order.id, open);
    },
    [order.id, setOrderOpenAccount]
  );

  const handleCourierChange = useCallback(
    (courier: string | null) => {
      void setOrderCourier(order.id, courier);
    },
    [order.id, setOrderCourier]
  );

  return (
    <main className="h-full flex flex-col px-4 pt-4 pb-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      <OrderDetailHeader
        order={order}
        onPrint={() => handlePrint()}
        onToggleOpen={handleToggleOpen}
        showReceipt={showReceipt}
        onToggleReceipt={() => setShowReceipt((v) => !v)}
      />

      {/* İki sütun: Sol içerik, Sağ fiş (aç/kapa). Fiş gizliyken içerik tam genişlik. */}
      <div className="flex-1 min-h-0 flex gap-6">
        <OrderDetailsContent
          order={order}
          onStatusChange={handleStatusChange}
          onPaymentUpdate={handlePaymentUpdate}
          onCollect={handleCollect}
          onToggleOpen={handleToggleOpen}
          onCourierChange={handleCourierChange}
        />

        <ReceiptPreview
          ref={receiptRef}
          order={order}
          onPrint={() => handlePrint()}
          openAccounts={openAccounts}
          collapsed={!showReceipt}
        />
      </div>
    </main>
  );
}
