"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMenuStore } from "@/store/menuStore";
import {
  type Corporate,
  type ProductCategory,
  type Product,
  type PortionOption,
  type Voucher,
  type VoucherItem,
  PORTION_OPTIONS,
  PORTIONABLE_CATEGORIES,
} from "@/types";
import { createVoucher, updateVoucher } from "@/actions/vouchers";
import { formatCurrency } from "@/lib/utils";
import { toDateInputValue } from "@/lib/period";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { ArrowLeft, ShoppingCart, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { VisuallyHidden } from "radix-ui";
import { ProductBrowser } from "../_components/ProductBrowser";
import {
  VoucherCart,
  calcUnitPrice,
  type VoucherDraftItem,
} from "../_components/VoucherCart";

function makeKey(productId: string, portion?: PortionOption): string {
  return portion ? `${productId}__${portion.size}` : productId;
}

export default function NewVoucherClient({
  corporate,
  voucher,
}: {
  corporate: Corporate;
  voucher?: Voucher;
}) {
  const router = useRouter();
  const isEdit = !!voucher;
  const menuItems = useMenuStore((s) => s.items);
  const loadMenu = useMenuStore((s) => s.loadMenu);
  const isLoadingMenu = menuItems.length === 0;

  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Map<string, VoucherDraftItem>>(new Map());
  const [date, setDate] = useState(
    voucher ? toDateInputValue(new Date(voucher.date)) : toDateInputValue(new Date()),
  );
  const [note, setNote] = useState(voucher?.note ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hydratedFromVoucher, setHydratedFromVoucher] = useState(false);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  // Edit modunda menü yüklendikten sonra fiş kalemlerini sepete doldur
  useEffect(() => {
    if (!voucher || hydratedFromVoucher || menuItems.length === 0) return;

    const next = new Map<string, VoucherDraftItem>();
    const missing: string[] = [];

    for (const it of voucher.items ?? []) {
      const product = menuItems.find((p) => p.id === it.productId);
      if (!product) {
        missing.push(it.name);
        continue;
      }
      const portion = it.portionLabel
        ? PORTION_OPTIONS.find((p) => p.label === it.portionLabel)
        : undefined;
      const key = makeKey(product.id, portion);
      next.set(key, { product, portion, quantity: it.quantity });
    }

    setItems(next);
    setHydratedFromVoucher(true);
    if (missing.length) {
      toast.warning(`${missing.length} kalem menüden kaldırılmış: ${missing.join(", ")}`);
    }
  }, [voucher, menuItems, hydratedFromVoucher]);

  const totalQty = useMemo(
    () => Array.from(items.values()).reduce((s, it) => s + it.quantity, 0),
    [items],
  );

  const total = useMemo(() => {
    let sum = 0;
    items.forEach((it) => {
      sum += calcUnitPrice(it.product, it.portion) * it.quantity;
    });
    return Math.round(sum * 100) / 100;
  }, [items]);

  const getProductTotalQty = (productId: string) => {
    let sum = 0;
    items.forEach((it) => {
      if (it.product.id === productId) sum += it.quantity;
    });
    return sum;
  };

  const addItem = (product: Product) => {
    const key = makeKey(product.id);
    setItems((prev) => {
      const next = new Map(prev);
      const cur = next.get(key);
      next.set(key, { product, quantity: (cur?.quantity ?? 0) + 1 });
      return next;
    });
  };

  const addItemWithPortion = (product: Product, portion: PortionOption) => {
    const key = makeKey(product.id, portion);
    setItems((prev) => {
      const next = new Map(prev);
      const cur = next.get(key);
      next.set(key, { product, portion, quantity: (cur?.quantity ?? 0) + 1 });
      return next;
    });
  };

  const decrementByKey = (key: string) => {
    setItems((prev) => {
      const next = new Map(prev);
      const cur = next.get(key);
      if (!cur) return next;
      if (cur.quantity <= 1) next.delete(key);
      else next.set(key, { ...cur, quantity: cur.quantity - 1 });
      return next;
    });
  };

  const incrementByKey = (key: string) => {
    setItems((prev) => {
      const next = new Map(prev);
      const cur = next.get(key);
      if (!cur) return next;
      next.set(key, { ...cur, quantity: cur.quantity + 1 });
      return next;
    });
  };

  const removeByKey = (key: string) => {
    setItems((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  // Kart üzerindeki ±: portionable ürünlerde son eklenenden azaltılır
  const decrementProduct = (product: Product) => {
    const portionable = PORTIONABLE_CATEGORIES.includes(product.category);
    if (!portionable) {
      decrementByKey(makeKey(product.id));
      return;
    }
    let foundKey: string | null = null;
    items.forEach((_, key) => {
      if (key.startsWith(`${product.id}__`)) foundKey = key;
    });
    if (foundKey) decrementByKey(foundKey);
  };

  const handleSubmit = async () => {
    if (items.size === 0) {
      toast.error("En az bir ürün seçin");
      return;
    }
    setIsSaving(true);
    try {
      const voucherItems: VoucherItem[] = Array.from(items.values()).map((it) => {
        const unitPrice = calcUnitPrice(it.product, it.portion);
        return {
          productId: it.product.id,
          name: it.product.name,
          quantity: it.quantity,
          unitPrice,
          totalPrice: Math.round(unitPrice * it.quantity * 100) / 100,
          portionLabel: it.portion?.label,
        };
      });

      if (isEdit && voucher) {
        const result = await updateVoucher(voucher.id, {
          type: "per_item",
          corporateId: corporate.id,
          date: new Date(date + "T12:00:00"),
          items: voucherItems,
          note: note.trim() || undefined,
        });
        if (!result.ok) {
          toast.error(result.error ?? "Fiş güncellenemedi");
          return;
        }
        toast.success(`Fiş #${voucher.voucherNumber} güncellendi`);
      } else {
        const result = await createVoucher({
          type: "per_item",
          corporateId: corporate.id,
          date: new Date(date + "T12:00:00"),
          items: voucherItems,
          note: note.trim() || undefined,
        });
        if (!result.ok) {
          toast.error(result.error ?? "Fiş oluşturulamadı");
          return;
        }
        toast.success(`Fiş #${result.voucherNumber} oluşturuldu`);
      }
      router.push(`/corporate/${corporate.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const cart = (
    <VoucherCart
      corporate={corporate}
      date={date}
      setDate={setDate}
      note={note}
      setNote={setNote}
      items={items}
      totalQty={totalQty}
      total={total}
      isSaving={isSaving}
      isEdit={isEdit}
      onIncrement={incrementByKey}
      onDecrement={decrementByKey}
      onRemove={removeByKey}
      onSubmit={handleSubmit}
    />
  );

  return (
    <main className="h-full flex flex-col px-3 pt-3 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      <div className="mb-3 shrink-0">
        <Link
          href={`/corporate/${corporate.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          <ArrowLeft className="h-3 w-3" />
          {corporate.name}
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          {isEdit ? `Fiş Düzenle #${voucher?.voucherNumber}` : "Yeni Fiş"}
        </h1>
      </div>

      <div className="flex-1 min-h-0 grid gap-4 lg:gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <ProductBrowser
          menuItems={menuItems}
          isLoading={isLoadingMenu}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          search={search}
          setSearch={setSearch}
          getProductTotalQty={getProductTotalQty}
          onAdd={addItem}
          onDecrement={decrementProduct}
          onPortion={addItemWithPortion}
        />

        {/* Sağ panel — sadece lg+ */}
        <div className="hidden lg:block min-w-0 min-h-0 pb-3 rounded-xl border bg-card overflow-hidden">
          {cart}
        </div>
      </div>

      {/* Mobil sticky bar */}
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
                {totalQty > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-background/25 text-xs font-bold tabular-nums">
                    {totalQty}
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
          className="data-[side=right]:w-screen sm:data-[side=right]:max-w-md p-0 flex flex-col"
        >
          <VisuallyHidden.Root>
            <SheetTitle>Fiş Detayları</SheetTitle>
            <SheetDescription>
              Seçilen ürünler ve fişi tamamlamak için form.
            </SheetDescription>
          </VisuallyHidden.Root>
          {cart}
        </SheetContent>
      </Sheet>
    </main>
  );
}
