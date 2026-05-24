import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MENU_CATEGORIES } from "@/data/menu";
import {
  type Product,
  type ProductCategory,
  type PortionOption,
} from "@/types";
import { categoryImage, fallbackCategoryUrl } from "@/lib/images";
import { Search, X } from "lucide-react";
import { CategoryChip } from "./CategoryChip";
import { ProductSelectCard } from "./ProductSelectCard";

const GRID_CLASS =
  "grid gap-2 sm:gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

interface ProductBrowserProps {
  menuItems: Product[];
  isLoading: boolean;
  activeCategory: ProductCategory | "all";
  setActiveCategory: (c: ProductCategory | "all") => void;
  search: string;
  setSearch: (s: string) => void;
  getProductTotalQty: (productId: string) => number;
  onAdd: (product: Product) => void;
  onDecrement: (product: Product) => void;
  onPortion: (product: Product, portion: PortionOption) => void;
}

export function ProductBrowser({
  menuItems,
  isLoading,
  activeCategory,
  setActiveCategory,
  search,
  setSearch,
  getProductTotalQty,
  onAdd,
  onDecrement,
  onPortion,
}: ProductBrowserProps) {
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCategory = activeCategory === "all" || item.category === activeCategory;
      const matchesSearch =
        search === "" || item.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, activeCategory, search]);

  return (
    <div className="min-w-0 min-h-0 pb-20 lg:pb-3 flex flex-col gap-3">
      {/* Search */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Ürün ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 pr-10 h-11"
        />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={() => setSearch("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Category strip */}
      <div className="relative shrink-0">
        <div className="-mx-px overflow-x-auto lg:overflow-visible scrollbar-hide">
          <div className="flex gap-2 sm:gap-3 pb-1 w-max lg:w-auto lg:flex-wrap px-px">
            <CategoryChip
              label="Tümü"
              emoji="🍽️"
              count={menuItems.length}
              isActive={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
            />
            {MENU_CATEGORIES.map((cat) => {
              const count = menuItems.filter((p) => p.category === cat.value).length;
              if (count === 0) return null;
              return (
                <CategoryChip
                  key={cat.value}
                  label={cat.label}
                  emoji={cat.emoji}
                  imageSrc={categoryImage(cat.value)}
                  fallbackSrc={fallbackCategoryUrl(cat.value)}
                  count={count}
                  isActive={activeCategory === cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                />
              );
            })}
          </div>
        </div>
        <div className="lg:hidden pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-linear-to-l from-background to-transparent" />
      </div>

      {/* Product grid */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px pb-2 px-px">
        {isLoading ? (
          <div className={GRID_CLASS}>
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl bg-card ring-1 ring-foreground/8 overflow-hidden"
              >
                <div className="aspect-5/4 w-full animate-pulse bg-linear-to-br from-muted to-muted/60" />
                <div className="px-2 py-1.5 space-y-1.5">
                  <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Search className="mb-3 h-10 w-10 opacity-30" />
            <p>Ürün bulunamadı</p>
          </div>
        ) : (
          <div className={GRID_CLASS}>
            {filteredItems.map((product) => {
              const qty = getProductTotalQty(product.id);
              const portionable = Boolean(product.portionable);
              return (
                <ProductSelectCard
                  key={product.id}
                  product={product}
                  qty={qty}
                  portionable={portionable}
                  onAdd={() => onAdd(product)}
                  onIncrement={() => onAdd(product)}
                  onDecrement={() => onDecrement(product)}
                  onPortion={(portion) => onPortion(product, portion)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
