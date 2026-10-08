"use client";

import { useEffect, useState } from "react";
import {
  useOrderStore,
  selectSubtotal,
  selectTotal,
  selectDiscountAmount,
  selectCanComplete,
} from "@/store/orderStore";
import { Separator } from "@/components/ui/separator";
import { cn, formatCurrency } from "@/lib/utils";
import { ChevronDown, ShoppingCart } from "lucide-react";
import {
  type SavedCustomer,
  type CustomerAddress,
  type PaymentMethod,
  type MealCardBrand,
} from "@/types";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";
import ThermalReceipt from "@/components/receipt/ThermalReceipt";
import { CustomerSearch } from "./sidepanel/CustomerSearch";
import { CustomerOpenAccountWarning } from "./sidepanel/CustomerOpenAccountWarning";
import { CustomerWinbackHint } from "./sidepanel/CustomerWinbackHint";
import { CartList } from "./sidepanel/CartList";
import { PaymentPicker } from "./sidepanel/PaymentPicker";
import { NotesSection } from "./sidepanel/NotesSection";
import { DiscountSection } from "./sidepanel/DiscountSection";
import { CheckoutFooter } from "./sidepanel/CheckoutFooter";
import { useOrderSubmit } from "@/hooks/useOrderSubmit";
import { useCustomerOpenAccounts } from "@/hooks/useCustomerOpenAccounts";

interface OrderSidePanelProps {
  /** Sticky alt bar ile çalışma modu (mobil Sheet için) */
  variant?: "desktop" | "sheet";
  /** Sipariş modu — store yerine prop'tan gelir ki ilk render'da
   *  bile doğru olsun (useEffect race window kapanır). */
  mode: "create" | "edit";
}

export default function OrderSidePanel({
  variant = "desktop",
  mode,
}: OrderSidePanelProps) {
  // Per-field selector'lar — bileşen sadece kullandığı alanlara abone.
  const draft = useOrderStore((s) => s.draft);
  const savedCustomers = useOrderStore((s) => s.savedCustomers);
  const removeItem = useOrderStore((s) => s.removeItem);
  const updateQuantity = useOrderStore((s) => s.updateQuantity);
  const setCustomer = useOrderStore((s) => s.setCustomer);
  const setUpdateSavedAddress = useOrderStore((s) => s.setUpdateSavedAddress);
  const setPayment = useOrderStore((s) => s.setPayment);
  const setNotes = useOrderStore((s) => s.setNotes);
  const setDiscount = useOrderStore((s) => s.setDiscount);
  const loadSavedCustomers = useOrderStore((s) => s.loadSavedCustomers);

  const subtotal = useOrderStore(selectSubtotal);
  const total = useOrderStore(selectTotal);
  const discountAmount = useOrderStore(selectDiscountAmount);
  const canComplete = useOrderStore(selectCanComplete);
  const isEditMode = mode === "edit";
  const isSheet = variant === "sheet";
  // Mobil 2. adım: sepet ürün adımında düzenlenir; burada kapalı durur, istek eklemek için açılır.
  const [cartOpen, setCartOpen] = useState(false);

  // Müşterinin açık hesabı — uyarı kutusu + basılan fiş ortak kullanır (tek sorgu).
  const openAccounts = useCustomerOpenAccounts(draft.customer.phone ?? "");

  // Submit/print/cancel orkestrasyonu hook'ta.
  const { isSubmitting, receiptRef, onComplete, onSaveEdit, onCancel } =
    useOrderSubmit();

  // Müşteri listesini her mount'ta tazele (Müşteriler sayfasındaki
  // değişiklikler sayfa yenilenmeden burada da görünsün).
  useEffect(() => {
    void loadSavedCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCustomer = (c: SavedCustomer, a: CustomerAddress) => {
    setCustomer({
      name: c.phone,
      phone: c.phone,
      address: a.address,
      addressDetail: a.addressDetail,
      addressId: a.id,
    });
    setUpdateSavedAddress(false);
  };

  // Ödeme yöntemi
  const selectedMethod = (draft.payment.method ?? "cash") as PaymentMethod;
  const selectedBrand = (draft.payment.mealCardBrand ?? "multinet") as MealCardBrand;

  const handleMethodChange = (method: PaymentMethod) => {
    setPayment({
      method,
      split: undefined, // tek yöntem seçildi → bölünmüş ödeme kalkar
      mealCardBrand: method === "meal_card" ? selectedBrand : undefined,
      ibanName: method === "iban" ? DEFAULT_IBAN_NAME : undefined,
      ibanNumber: method === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
    });
  };

  // Sepet aksiyonları
  const handleCartIncrement = (key: string, currentQty: number) => {
    updateQuantity(key, currentQty + 1);
  };

  const handleCartDecrement = (key: string, currentQty: number) => {
    updateQuantity(key, currentQty - 1);
  };

  const cartList = (
    <CartList
      items={draft.items}
      onIncrement={handleCartIncrement}
      onDecrement={handleCartDecrement}
      onRemove={removeItem}
    />
  );

  const discountSection = (
    <DiscountSection
      discount={draft.discount}
      amount={discountAmount}
      onChange={setDiscount}
    />
  );

  const paymentPicker = (
    <PaymentPicker
      selectedMethod={selectedMethod}
      selectedBrand={selectedBrand}
      onMethodChange={handleMethodChange}
      onBrandChange={(brand) => setPayment({ mealCardBrand: brand })}
    />
  );

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
            selectedAddressId={draft.customer.addressId}
            updateSaved={!!draft.updateSavedAddress}
            onUpdateSavedChange={setUpdateSavedAddress}
            autoFocus={variant === "desktop"}
            onAddressChange={(value) => setCustomer({ address: value })}
            onAddressDetailChange={(value) => setCustomer({ addressDetail: value })}
            onPhoneChange={(value) => setCustomer({ phone: value, name: value })}
            onSelectCustomer={handleSelectCustomer}
          />

          <CustomerOpenAccountWarning accounts={openAccounts} />

          {!isEditMode && <CustomerWinbackHint phone={draft.customer.phone ?? ""} />}

          <Separator />

          {isSheet ? (
            <>
              {paymentPicker}
              {discountSection}
              <NotesSection notes={draft.notes ?? ""} onChange={setNotes} />
              <Separator />
              {cartOpen ? (
                cartList
              ) : (
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="flex w-full items-center gap-2 rounded-xl bg-muted/40 px-3 py-3 text-left hover:bg-muted/60 transition-colors"
                >
                  <ShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium tabular-nums">
                      Sepet · {draft.items.reduce((sum, i) => sum + i.quantity, 0)} ürün ·{" "}
                      {formatCurrency(subtotal)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Aç: adet değiştir, istek ekle (soğansız…)
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              )}
            </>
          ) : (
            <>
              {cartList}
              {discountSection}
              <Separator />
              {paymentPicker}
              <NotesSection notes={draft.notes ?? ""} onChange={setNotes} />
            </>
          )}
        </div>
      </div>

      <CheckoutFooter
        subtotal={subtotal}
        discountAmount={discountAmount}
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
          <ThermalReceipt
            draft={draft}
            total={total}
            subtotal={subtotal}
            openAccounts={openAccounts}
          />
        </div>
      </div>
    </div>
  );
}
