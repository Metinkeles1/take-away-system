import { memo } from "react";
import { type Product } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";

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
    <Card
      className={`transition-shadow hover:shadow-md ${!product.available ? "opacity-60" : ""}`}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl">
          {cat?.emoji ?? "🍽️"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-base truncate">{product.name}</p>
            {!product.available && (
              <Badge variant="outline" className="text-muted-foreground">
                Pasif
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="secondary" className="text-xs">
              {cat?.label ?? product.category}
            </Badge>
            {product.description && (
              <span className="text-xs text-muted-foreground truncate">
                {product.description}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-base whitespace-nowrap">
            {formatCurrency(product.price)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onToggle(product)}
            title={product.available ? "Pasif yap" : "Aktif yap"}
          >
            {product.available ? (
              <Eye className="h-4 w-4 text-green-600" />
            ) : (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(product)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(product)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
