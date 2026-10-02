import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/products/ProductImage";
import { productImage, fallbackProductUrl } from "@/lib/images";
import { cn, formatCurrency } from "@/lib/utils";
import { ShoppingCart, Plus, Minus, Trash2, SlidersHorizontal, Split } from "lucide-react";
import { type OrderDraft } from "@/types";
import { useMenuStore } from "@/store/menuStore";
import { useOrderStore } from "@/store/orderStore";
import { SectionTitle } from "./SectionTitle";
import { PortionBadge } from "../../PortionBadge";
import { ItemOptionChips } from "../../ItemOptionChips";
import { orderItemKey, orderItemUnitPrice } from "@/lib/orders/items";
import { itemOptionsFor } from "@/lib/orders/itemOptions";

interface CartListProps {
  items: OrderDraft["items"];
  onIncrement: (key: string, currentQty: number) => void;
  onDecrement: (key: string, currentQty: number) => void;
  onRemove: (key: string) => void;
}

export function CartList({ items, onIncrement, onDecrement, onRemove }: CartListProps) {
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  // Sipariş kaydında ürün resmi tutulmaz (DB'yi şişirmesin); düzenleme
  // ekranında resim ürün id'si üzerinden canlı menüden alınır.
  const menuItems = useMenuStore((s) => s.items);
  // İstek paneli açık olan satır (aynı anda tek satır)
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <section>
      <SectionTitle
        icon={ShoppingCart}
        title="Sepet"
        right={
          totalItems > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {totalItems} ürün
            </span>
          ) : null
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground rounded-lg bg-muted/30">
          <ShoppingCart className="mb-2 h-8 w-8 opacity-30" />
          <p className="text-xs">Henüz ürün eklenmedi</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const key = orderItemKey(item);
            const unitPrice = orderItemUnitPrice(item);
            const isOpen = openKey === key;
            const hasExtras = Boolean(item.options?.length || item.note);
            return (
              <li
                key={key}
                className={cn(
                  "rounded-lg transition-colors",
                  isOpen ? "bg-muted/50 ring-1 ring-foreground/8" : "hover:bg-muted/40",
                )}
              >
                <div className="flex items-center gap-2 p-1.5">
                  <div className="h-9 w-9 rounded-md overflow-hidden shrink-0 ring-1 ring-foreground/8">
                    <ProductImage
                      src={productImage({
                        ...item.product,
                        image:
                          menuItems.find((m) => m.id === item.product.id)?.image ??
                          item.product.image,
                      })}
                      alt={item.product.name}
                      fallbackSrc={fallbackProductUrl(
                        item.product.id,
                        item.product.category,
                        item.product.name,
                      )}
                      placeholderClassName="h-full w-full"
                    />
                  </div>
                  {/* Satıra dokununca istek paneli açılır (soğansız vb.) */}
                  <button
                    type="button"
                    onClick={() => setOpenKey(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    title="İstek ekle (soğansız, acısız…)"
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <p className="flex items-center gap-1 text-xs font-medium leading-tight">
                      <span className="truncate">{item.product.name}</span>
                      <SlidersHorizontal
                        className={cn(
                          "h-3 w-3 shrink-0",
                          isOpen || hasExtras ? "text-primary" : "text-muted-foreground/50",
                        )}
                      />
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                      {item.portion && <PortionBadge portion={item.portion} />}
                      <p className="text-[11px] text-muted-foreground tabular-nums truncate">
                        {/* Adet 1 iken birim fiyat = tutar; dar panelde yer kaplamasın */}
                        {item.quantity > 1 && `${item.quantity} × ${formatCurrency(unitPrice)} `}
                        <span className="font-semibold text-foreground">
                          {formatCurrency(item.totalPrice)}
                        </span>
                      </p>
                    </div>
                    {!isOpen && <ItemOptionChips item={item} className="mt-1" />}
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0 rounded-full"
                      onClick={() => onDecrement(key, item.quantity)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-5 text-center text-xs font-bold tabular-nums">
                      {item.quantity}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0 rounded-full"
                      onClick={() => onIncrement(key, item.quantity)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => onRemove(key)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {isOpen && (
                  <ItemRequestPanel
                    item={item}
                    itemKey={key}
                    onSplit={(newKey) => setOpenKey(newKey)}
                    onDone={() => setOpenKey(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Satırın istek paneli: kategoriye göre hazır seçimler (tek dokunuş aç/kapat),
// serbest not ve adet > 1 ise "1 tanesini ayır" (biri soğansız, biri normal).
function ItemRequestPanel({
  item,
  itemKey,
  onSplit,
  onDone,
}: {
  item: OrderDraft["items"][number];
  itemKey: string;
  onSplit: (newKey: string) => void;
  onDone: () => void;
}) {
  const toggleItemOption = useOrderStore((s) => s.toggleItemOption);
  const updateItemNote = useOrderStore((s) => s.updateItemNote);
  const splitItem = useOrderStore((s) => s.splitItem);
  const options = itemOptionsFor(item.product.category);
  const selected = item.options ?? [];

  return (
    <div className="space-y-2 px-1.5 pb-2">
      {item.quantity > 1 && (
        <button
          type="button"
          onClick={() => {
            const newKey = splitItem(itemKey);
            if (newKey) onSplit(newKey);
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/40 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 cursor-pointer"
        >
          <Split className="h-3.5 w-3.5" />
          1 tanesini ayır — sadece birine istek ekle
        </button>
      )}
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => toggleItemOption(itemKey, o)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors cursor-pointer active:scale-95",
                  on
                    ? "bg-destructive text-white ring-destructive"
                    : "bg-card text-foreground/80 ring-foreground/15 hover:ring-destructive/40",
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      )}
      <Input
        value={item.note ?? ""}
        onChange={(e) => updateItemNote(itemKey, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone();
        }}
        placeholder="Başka istek (ör. az tuzlu)"
        className="h-8 text-xs"
      />
    </div>
  );
}
