import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/products/ProductImage";
import PortionSelector from "@/components/orders/create/PortionSelector";
import { productImage, fallbackProductUrl } from "@/lib/images";
import { cn, formatCurrency } from "@/lib/utils";
import { type Product, type PortionOption, PORTION_OPTIONS } from "@/types";
import { Plus, Minus } from "lucide-react";

const FULL_PORTION =
  PORTION_OPTIONS.find((p) => p.size === "full") ?? PORTION_OPTIONS[0];

const MIN_PORTION_MULT = Math.min(...PORTION_OPTIONS.map((p) => p.multiplier));
const MAX_PORTION_MULT = Math.max(...PORTION_OPTIONS.map((p) => p.multiplier));

interface ProductSelectCardProps {
  product: Product;
  qty: number;
  portionable: boolean;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onPortion: (portion: PortionOption) => void;
}

export function ProductSelectCard({
  product,
  qty,
  portionable,
  onAdd,
  onIncrement,
  onDecrement,
  onPortion,
}: ProductSelectCardProps) {
  const handleCardClick = () => {
    if (portionable) {
      onPortion(FULL_PORTION);
    } else {
      onAdd();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${product.name} ekle`}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className={cn(
        "group relative flex flex-col rounded-xl ring-1 overflow-hidden transition-all min-w-0 cursor-pointer active:scale-[0.98]",
        qty > 0
          ? "ring-2 ring-primary shadow-sm bg-primary/5"
          : "bg-card ring-foreground/8 hover:ring-foreground/25 hover:shadow-sm",
      )}
    >
      <div className="relative aspect-5/4 w-full">
        <ProductImage
          src={productImage(product)}
          alt={product.name}
          fallbackSrc={fallbackProductUrl(product.id, product.category, product.name)}
          placeholderClassName="absolute inset-0"
        />
        {qty > 0 && (
          <div
            key={qty}
            className="absolute right-1.5 top-1.5 flex items-center justify-center min-w-6 h-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-1.5 shadow-md ring-2 ring-background tabular-nums animate-in zoom-in-75 duration-200"
          >
            {qty}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 px-2 py-1.5 min-w-0">
        <p className="font-medium text-[12px] leading-tight line-clamp-2 min-h-[2em] wrap-break-word">
          {product.name}
        </p>

        {portionable ? (
          <>
            <span className="font-bold text-[13px] text-foreground tabular-nums truncate">
              {formatCurrency(Math.round(product.price * MIN_PORTION_MULT))}
              <span className="text-muted-foreground font-medium mx-0.5">–</span>
              {formatCurrency(Math.round(product.price * MAX_PORTION_MULT))}
            </span>
            <PortionSelector
              product={product}
              onSelect={onPortion}
              className="mt-0.5"
            />
          </>
        ) : (
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="font-bold text-[13px] text-foreground tabular-nums truncate min-w-0">
              {formatCurrency(product.price)}
            </span>

            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
              {qty === 0 ? (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 w-7 p-0 rounded-full"
                  onClick={onAdd}
                  aria-label={`${product.name} ekle`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <div className="flex items-center gap-0.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 w-6 p-0 rounded-full"
                    onClick={onDecrement}
                    aria-label={`${product.name} azalt`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-6 w-6 p-0 rounded-full"
                    onClick={onIncrement}
                    aria-label={`${product.name} arttır`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
