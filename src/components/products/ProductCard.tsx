import { memo } from "react";
import { type Product } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { productImage, fallbackProductUrl } from "@/lib/images";

const CATEGORY_MAP = Object.fromEntries(
  MENU_CATEGORIES.map((c) => [c.value, c]),
) as Record<string, (typeof MENU_CATEGORIES)[number]>;

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onToggle: (product: Product) => void;
}

export const ProductCard = memo(function ProductCard({
  product,
  onEdit,
  onDelete,
  onToggle,
}: ProductCardProps) {
  const cat = CATEGORY_MAP[product.category];
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl bg-card ring-1 ring-foreground/8 shadow-sm shadow-foreground/3 overflow-hidden transition-all hover:shadow-md hover:ring-foreground/15 hover:-translate-y-0.5",
        !product.available && "opacity-60",
      )}
    >
      {/* Resim alanı */}
      <div className="relative aspect-square w-full">
        <ProductImage
          src={productImage(product)}
          alt={product.name}
          fallbackSrc={fallbackProductUrl(product.id, product.category)}
          placeholderClassName="absolute inset-0"
        />

        {/* Üst sol: kategori chip */}
        <div className="absolute left-2 top-2">
          <Badge
            variant="secondary"
            className="bg-background/95 text-[10px] font-medium shadow-sm"
          >
            <span className="mr-1">{cat?.emoji}</span>
            {cat?.label ?? product.category}
          </Badge>
        </div>

        {/* Üst sağ: pasif rozeti */}
        {!product.available && (
          <div className="absolute right-2 top-2">
            <Badge variant="destructive" className="text-[10px]">
              Pasif
            </Badge>
          </div>
        )}

        {/* Hover aksiyonları (md+) */}
        <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 bg-background shadow-sm"
            onClick={() => onToggle(product)}
            title={product.available ? "Pasif yap" : "Aktif yap"}
          >
            {product.available ? (
              <Eye className="h-4 w-4 text-emerald-600" />
            ) : (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 bg-background shadow-sm"
            onClick={() => onEdit(product)}
            title="Düzenle"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 bg-background shadow-sm text-destructive hover:text-destructive"
            onClick={() => onDelete(product)}
            title="Sil"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* İçerik */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.5em]">
          {product.name}
        </p>
        {product.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-1">
            {product.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <span className="font-bold text-base text-foreground">
            {formatCurrency(product.price)}
          </span>
          {/* Mobilde her zaman görünen aksiyonlar (hover olmadığı için) */}
          <div className="flex md:hidden gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onToggle(product)}
            >
              {product.available ? (
                <Eye className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(product)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(product)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
