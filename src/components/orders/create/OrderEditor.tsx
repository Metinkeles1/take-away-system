"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOrderStore, selectTotal, selectTotalItems } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import ProductSelector from "./ProductSelector";
import OrderSidePanel from "./OrderSidePanel";
import { ArrowLeft, ArrowRight, ShoppingCart } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Order } from "@/types";

type OrderEditorProps =
  | { mode: "create"; initialOrder?: never }
  | { mode: "edit"; initialOrder: Order };

const MOBILE_STEPS = ["Ürünler", "Adres ve ödeme"] as const;

export default function OrderEditor({ mode, initialOrder }: OrderEditorProps) {
  const editingOrderId = useOrderStore((s) => s.editingOrderId);
  const loadOrderForEdit = useOrderStore((s) => s.loadOrderForEdit);
  const resetDraft = useOrderStore((s) => s.resetDraft);
  const total = useOrderStore(selectTotal);
  const totalItems = useOrderStore(selectTotalItems);
  // xl altı iki adım: 1 = ürün seçimi, 2 = müşteri/adres + ödeme. Masaüstü tek ekran.
  const [step, setStep] = useState<1 | 2>(1);

  // Sepet boşalınca (2. adımda son ürün silindi, sipariş tamamlandı) ürün adımına dön;
  // aksi halde sonraki siparişin ilk ürünü eklenir eklenmez ödeme adımı açılırdı.
  if (step === 2 && totalItems === 0) setStep(1);

  const isEdit = mode === "edit";

  // Create: her mount sıfırlar. Edit: store'a siparişi yükler, unmount'ta temizler.
  useEffect(() => {
    if (isEdit && initialOrder) {
      loadOrderForEdit(initialOrder);
      return () => {
        resetDraft();
      };
    }
    resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, isEdit ? initialOrder?.id : null]);

  // Edit modunda store ilgili siparişe yüklenmediyse boş draft ile flicker olmasın.
  if (isEdit && initialOrder && editingOrderId !== initialOrder.id) {
    return null;
  }

  const onDetails = step === 2;

  return (
    <main className="h-full flex flex-col px-3 pt-3 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      {/* Başlık */}
      <div className="mb-3 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {onDetails && (
              <Button
                variant="ghost"
                size="icon"
                className="xl:hidden -ml-2 shrink-0"
                aria-label="Ürünlere dön"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            {isEdit && initialOrder && (
              <Button variant="ghost" size="sm" className={cn(onDetails && "hidden xl:inline-flex")} asChild>
                <Link href={`/orders/${initialOrder.id}`}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Geri
                </Link>
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                {isEdit && initialOrder
                  ? `Sipariş #${initialOrder.orderNumber} — Düzenle`
                  : "Yeni Sipariş"}
              </h1>
              <p className="hidden xl:block text-xs text-muted-foreground mt-0.5">
                {isEdit
                  ? "Yeni sipariş ekranıyla aynı yönetim: ürünleri ve müşteri/ödemeyi güncelle, sonra kaydet."
                  : "Ürünleri seç, müşteri ve ödemeyi gir, tek tıkla tamamla"}
              </p>
            </div>
          </div>
          {onDetails && (
            <Button
              variant="secondary"
              size="sm"
              className="xl:hidden shrink-0 rounded-full"
              onClick={() => setStep(1)}
            >
              {totalItems} ürün · Düzenle
            </Button>
          )}
        </div>

        {/* Adım göstergesi — xl altı */}
        <ol className="xl:hidden grid grid-cols-2 gap-1.5" aria-label="Sipariş adımları">
          {MOBILE_STEPS.map((label, i) => (
            <li key={label} className="space-y-1" aria-current={i + 1 === step ? "step" : undefined}>
              <div
                className={cn(
                  "h-1 rounded-full",
                  i + 1 <= step ? "bg-primary" : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "text-xs",
                  i + 1 === step
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {i + 1}. {label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Tek-ekran layout */}
      <div className="flex-1 min-h-0 grid gap-4 xl:gap-5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className={cn("min-w-0 min-h-0 pb-20 xl:pb-3", onDetails && "hidden xl:block")}>
          <ProductSelector />
        </div>

        {/* Mobil 2. adım — sadece açıkken mount: müşteri listesi/fiş masaüstü panelle çift yüklenmesin */}
        {onDetails && (
          <div className="xl:hidden min-w-0 min-h-0 pb-3">
            <div className="h-full rounded-2xl ring-1 ring-foreground/8 overflow-hidden">
              <OrderSidePanel variant="sheet" mode={mode} />
            </div>
          </div>
        )}

        <div className="hidden xl:block min-w-0 min-h-0 pb-3">
          <OrderSidePanel variant="desktop" mode={mode} />
        </div>
      </div>

      {/* 1. adım alt çubuğu — xl altında */}
      {!onDetails && (
        <div className="xl:hidden fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="px-3 py-2.5 sm:px-4 sm:py-3 lg:max-w-2xl lg:mx-auto">
            <Button
              size="lg"
              className="w-full h-12 justify-between text-base"
              disabled={totalItems === 0}
              onClick={() => setStep(2)}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                <span className="tabular-nums">
                  {totalItems > 0 ? `${totalItems} ürün` : "Ürün seçin"}
                </span>
              </span>
              <span className="flex items-center gap-1.5 font-semibold">
                Devam
                <ArrowRight className="h-4 w-4" />
              </span>
              <span className="font-bold tabular-nums">{formatCurrency(total)}</span>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
