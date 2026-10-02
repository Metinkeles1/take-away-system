import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/products/ProductImage";
import { productImage, fallbackProductUrl } from "@/lib/images";
import { formatCurrency } from "@/lib/utils";
import { ShoppingCart, Plus, Minus, Trash2 } from "lucide-react";
import { type OrderDraft } from "@/types";
import { useMenuStore } from "@/store/menuStore";
import { SectionTitle } from "./SectionTitle";
import { PortionBadge } from "../../PortionBadge";
import { orderItemKey, orderItemUnitPrice } from "@/lib/orders/items";

interface CartListProps {
  items: OrderDraft["items"];
  onIncrement: (item: OrderDraft["items"][number]) => void;
  onDecrement: (key: string, currentQty: number) => void;
  onRemove: (key: string) => void;
}

export function CartList({ items, onIncrement, onDecrement, onRemove }: CartListProps) {
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  // Sipariş kaydında ürün resmi tutulmaz (DB'yi şişirmesin); düzenleme
  // ekranında resim ürün id'si üzerinden canlı menüden alınır.
  const menuItems = useMenuStore((s) => s.items);

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
            return (
              <li
                key={key}
                className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted/40 transition-colors"
              >
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
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate leading-tight">
                    {item.product.name}
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
                </div>
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
                    onClick={() => onIncrement(item)}
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
