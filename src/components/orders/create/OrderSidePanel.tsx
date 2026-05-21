"use client";

import { useEffect } from "react";
import {
  useOrderStore,
  selectSubtotal,
  selectTotal,
  selectCanComplete,
} from "@/store/orderStore";
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
import { CustomerSearch } from "./sidepanel/CustomerSearch";
import { CartList } from "./sidepanel/CartList";
import { PaymentPicker } from "./sidepanel/PaymentPicker";
import { NotesSection } from "./sidepanel/NotesSection";
import { CheckoutFooter } from "./sidepanel/CheckoutFooter";
import { useOrderSubmit } from "@/hooks/useOrderSubmit";

interface OrderSidePanelProps {
  /** Sticky alt bar ile çalışma modu (mobil Sheet için) */
  variant?: "desktop" | "sheet";
}

export default function OrderSidePanel({ variant = "desktop" }: OrderSidePanelProps) {
  // Per-field selector'lar — bileşen sadece kullandığı alanlara abone.
  const draft = useOrderStore((s) => s.draft);
  const editingOrderId = useOrderStore((s) => s.editingOrderId);
  const savedCustomers = useOrderStore((s) => s.savedCustomers);
  const addItem = useOrderStore((s) => s.addItem);
  const addItemWithPortion = useOrderStore((s) => s.addItemWithPortion);
  const removeItem = useOrderStore((s) => s.removeItem);
  const updateQuantity = useOrderStore((s) => s.updateQuantity);
  const setCustomer = useOrderStore((s) => s.setCustomer);
  const setPayment = useOrderStore((s) => s.setPayment);
  const setNotes = useOrderStore((s) => s.setNotes);
  const loadSavedCustomers = useOrderStore((s) => s.loadSavedCustomers);

  const subtotal = useOrderStore(selectSubtotal);
  const total = useOrderStore(selectTotal);
  const canComplete = useOrderStore(selectCanComplete);
  const isEditMode = Boolean(editingOrderId);

  // Submit/print/cancel orkestrasyonu hook'ta.
  const { isSubmitting, receiptRef, onComplete, onSaveEdit, onCancel } =
    useOrderSubmit();

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
        mode={isEditMode ? "edit" : "create"}
        onComplete={isEditMode ? onSaveEdit : () => onComplete(false)}
        onCompleteAndPrint={() => onComplete(true)}
        onCancel={onCancel}
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
