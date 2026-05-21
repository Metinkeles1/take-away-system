"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOrderStore, selectTotal, selectTotalItems } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import ProductSelector from "./ProductSelector";
import OrderSidePanel from "./OrderSidePanel";
import { ArrowLeft, ShoppingCart, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { VisuallyHidden } from "radix-ui";
import type { Order } from "@/types";

type OrderEditorProps =
  | { mode: "create"; initialOrder?: never }
  | { mode: "edit"; initialOrder: Order };

export default function OrderEditor({ mode, initialOrder }: OrderEditorProps) {
  const editingOrderId = useOrderStore((s) => s.editingOrderId);
  const loadOrderForEdit = useOrderStore((s) => s.loadOrderForEdit);
  const resetDraft = useOrderStore((s) => s.resetDraft);
  const total = useOrderStore(selectTotal);
  const totalItems = useOrderStore(selectTotalItems);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const sheetTitle = isEdit ? "Sipariş Düzenle" : "Sipariş Detayları";
  const sheetDescription = isEdit
    ? "Müşteri, sepet kalemleri ve ödeme bilgilerini düzenle."
    : "Müşteri bilgisi, sepet kalemleri ve ödemeyi tamamlamak için form.";

  return (
    <main className="h-full flex flex-col px-3 pt-3 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      {/* Başlık */}
      <div className="mb-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isEdit && initialOrder && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/orders/${initialOrder.id}`}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Geri
              </Link>
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {isEdit && initialOrder
                ? `Sipariş #${initialOrder.orderNumber} — Düzenle`
                : "Yeni Sipariş"}
            </h1>
            <p className="hidden sm:block text-xs text-muted-foreground mt-0.5">
              {isEdit
                ? "Yeni sipariş ekranıyla aynı yönetim: ürünleri ve müşteri/ödemeyi güncelle, sonra kaydet."
                : "Ürünleri seç, müşteri ve ödemeyi gir, tek tıkla tamamla"}
            </p>
          </div>
        </div>
      </div>

      {/* Tek-ekran layout */}
      <div className="flex-1 min-h-0 grid gap-4 xl:gap-5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 min-h-0 pb-20 xl:pb-3">
          <ProductSelector />
        </div>

        <div className="hidden xl:block min-w-0 min-h-0 pb-3">
          <OrderSidePanel variant="desktop" />
        </div>
      </div>

      {/* Sticky bottom action bar — xl altında */}
      <div className="xl:hidden fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 lg:max-w-2xl lg:mx-auto">
          <Button
            size="lg"
            className="w-full h-12 justify-between text-base"
            onClick={() => setSheetOpen(true)}
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              <span>
                Sepet
                {totalItems > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-background/25 text-xs font-bold tabular-nums">
                    {totalItems}
                  </span>
                )}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-bold tabular-nums">{formatCurrency(total)}</span>
              <ChevronUp className="h-5 w-5" />
            </span>
          </Button>
        </div>
      </div>

      {/* Mobil Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="data-[side=right]:w-screen sm:data-[side=right]:max-w-md lg:data-[side=right]:max-w-lg p-0 flex flex-col"
        >
          <VisuallyHidden.Root>
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>{sheetDescription}</SheetDescription>
          </VisuallyHidden.Root>
          <OrderSidePanel variant="sheet" />
        </SheetContent>
      </Sheet>
    </main>
  );
}
