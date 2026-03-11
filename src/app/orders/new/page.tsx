"use client";

import { useEffect } from "react";
import { useOrderStore } from "@/store/orderStore";
import StepIndicator from "@/components/order/StepIndicator";
import ProductSelector from "@/components/order/ProductSelector";
import CustomerForm from "@/components/order/CustomerForm";
import PaymentMethod from "@/components/order/PaymentMethod";
import OrderSummary from "@/components/order/OrderSummary";

export default function NewOrderPage() {
  const { draft, resetDraft } = useOrderStore();

  // Sayfa ilk açıldığında taslağı sıfırla
  useEffect(() => {
    resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-6 pb-4">
      {/* Başlık */}
      <div className="mb-4 text-center shrink-0">
        <h1 className="text-3xl font-bold tracking-tight">Yeni Sipariş</h1>
        <p className="mt-1 text-muted-foreground">
          Müşteri siparişini adım adım oluşturun
        </p>
      </div>

      {/* Adım göstergesi */}
      <div className="mb-4 shrink-0">
        <StepIndicator currentStep={draft.currentStep} />
      </div>

      {/* Adıma göre içerik */}
      <div className="flex-1 min-h-0">
        {draft.currentStep === "products" && <ProductSelector />}
        {draft.currentStep === "customer" && <CustomerForm />}
        {draft.currentStep === "payment" && <PaymentMethod />}
        {draft.currentStep === "summary" && <OrderSummary />}
      </div>
    </main>
  );
}
