"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReactToPrint } from "react-to-print";
import { useOrderStore, selectSubtotal, selectTotal } from "@/store/orderStore";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  type SavedCustomer,
  type PaymentMethod,
  type MealCardBrand,
  type OrderDraft,
} from "@/types";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";
import ThermalReceipt from "@/components/receipt/ThermalReceipt";
import { toast } from "sonner";
import { CustomerSearch } from "./sidepanel/CustomerSearch";
import { CartList } from "./sidepanel/CartList";
import { PaymentPicker } from "./sidepanel/PaymentPicker";
import { NotesSection } from "./sidepanel/NotesSection";
import { CheckoutFooter } from "./sidepanel/CheckoutFooter";

interface OrderSidePanelProps {
  /** Sticky alt bar ile çalışma modu (mobil Sheet için) */
  variant?: "desktop" | "sheet";
}

export default function OrderSidePanel({ variant = "desktop" }: OrderSidePanelProps) {
  const router = useRouter();
  const {
    draft,
    addItem,
    addItemWithPortion,
    removeItem,
    updateQuantity,
    setCustomer,
    setPayment,
    setNotes,
    completeOrder,
    savedCustomers,
    loadSavedCustomers,
  } = useOrderStore();
  const subtotal = useOrderStore(selectSubtotal);
  const total = useOrderStore(selectTotal);

  // Müşteri listesini bir kez yükle (client-side filtre için)
  useEffect(() => {
    if (savedCustomers.length === 0) {
      void loadSavedCustomers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCustomer = (c: SavedCustomer) => {
    setCustomer({
      name: c.phone,
      phone: c.phone,
      address: c.address,
      addressDetail: c.addressDetail,
    });
  };

  // Ödeme yöntemi
  const selectedMethod = (draft.payment.method ?? "cash") as PaymentMethod;
  const selectedBrand = (draft.payment.mealCardBrand ?? "multinet") as MealCardBrand;

  const handleMethodChange = (method: PaymentMethod) => {
    setPayment({
      method,
      mealCardBrand: method === "meal_card" ? selectedBrand : undefined,
      ibanName: method === "iban" ? DEFAULT_IBAN_NAME : undefined,
      ibanNumber: method === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
    });
  };

  // Yazdırma
  const receiptRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: "Siparis-Fis",
  });

  const canComplete =
    draft.items.length > 0 &&
    Boolean(draft.customer.phone) &&
    Boolean(draft.customer.address) &&
    Boolean(draft.payment.method);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = useCallback(
    async (alsoPrint: boolean) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      if (!draft.payment.method) {
        setPayment({ method: "cash" });
      }
      try {
        const order = await completeOrder();
        if (!order) {
          toast.error("Lütfen müşteri ve ödeme bilgilerini doldurun.");
          setIsSubmitting(false);
          return;
        }
        toast.success(`#${order.orderNumber} numaralı sipariş alındı!`);
        if (alsoPrint) {
          handlePrint();
        }
        router.push(`/orders/${order.id}`);
      } catch {
        toast.error("Sipariş kaydedilirken bir hata oluştu.");
        setIsSubmitting(false);
      }
    },
    [completeOrder, draft.payment.method, handlePrint, isSubmitting, router, setPayment],
  );

  // Sepet aksiyonları
  const handleCartIncrement = (item: OrderDraft["items"][number]) => {
    if (item.portion) {
      addItemWithPortion(item.product, item.portion);
    } else {
      addItem(item.product);
    }
  };

  const handleCartDecrement = (key: string, currentQty: number) => {
    updateQuantity(key, currentQty - 1);
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-card",
        variant === "desktop"
          ? "h-full rounded-2xl ring-1 ring-foreground/8 shadow-sm shadow-foreground/3 overflow-hidden"
          : "h-full",
      )}
    >
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="p-4 space-y-5">
          <CustomerSearch
            address={draft.customer.address ?? ""}
            addressDetail={draft.customer.addressDetail ?? ""}
            phone={draft.customer.phone ?? ""}
            savedCustomers={savedCustomers}
            autoFocus={variant === "desktop"}
            onAddressChange={(value) => setCustomer({ address: value })}
            onAddressDetailChange={(value) => setCustomer({ addressDetail: value })}
            onPhoneChange={(value) => setCustomer({ phone: value, name: value })}
            onSelectCustomer={handleSelectCustomer}
          />

          <Separator />

          <CartList
            items={draft.items}
            onIncrement={handleCartIncrement}
            onDecrement={handleCartDecrement}
            onRemove={removeItem}
          />

          <Separator />

          <PaymentPicker
            selectedMethod={selectedMethod}
            selectedBrand={selectedBrand}
            onMethodChange={handleMethodChange}
            onBrandChange={(brand) => setPayment({ mealCardBrand: brand })}
          />

          <NotesSection notes={draft.notes ?? ""} onChange={setNotes} />
        </div>
      </div>

      <CheckoutFooter
        subtotal={subtotal}
        total={total}
        canComplete={canComplete}
        isSubmitting={isSubmitting}
        onComplete={() => handleComplete(false)}
        onCompleteAndPrint={() => handleComplete(true)}
      />

      {/* Gizli yazdırma fişi */}
      <div className="hidden">
        <div ref={receiptRef}>
          <ThermalReceipt draft={draft} total={total} subtotal={subtotal} />
        </div>
      </div>
    </div>
  );
}
