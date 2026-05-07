"use client";

import { useEffect, useState } from "react";
import { useOrderStore, selectTotal } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { ProductSelector, OrderSidePanel } from "@/components/orders/create";
import { ShoppingCart, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { VisuallyHidden } from "radix-ui";

export default function NewOrderPage() {
  const { draft, resetDraft } = useOrderStore();
  const total = useOrderStore(selectTotal);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalItems = draft.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <main className="h-full flex flex-col px-3 pt-3 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      {/* Kompakt başlık */}
      <div className="mb-3 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Yeni Sipariş</h1>
          <p className="hidden sm:block text-xs text-muted-foreground mt-0.5">
            Ürünleri seç, müşteri ve ödemeyi gir, tek tıkla tamamla
          </p>
        </div>
      </div>

      {/* Tek-ekran layout */}
      <div className="flex-1 min-h-0 grid gap-4 lg:gap-5 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] 2xl:grid-cols-[1fr_440px]">
        {/* Sol: Ürün tarayıcı */}
        <div className="min-h-0 pb-20 lg:pb-3">
          <ProductSelector />
        </div>

        {/* Sağ: Yan panel — sadece lg+ */}
        <div className="hidden lg:block min-h-0 pb-3">
          <OrderSidePanel variant="desktop" />
        </div>
      </div>

      {/* Mobil: sticky bottom action bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="px-3 py-2.5">
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

      {/* Mobil Sheet — sağdan içeri */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col"
        >
          <VisuallyHidden.Root>
            <SheetTitle>Sipariş Detayları</SheetTitle>
          </VisuallyHidden.Root>
          <OrderSidePanel variant="sheet" />
        </SheetContent>
      </Sheet>
    </main>
  );
}
