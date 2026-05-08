"use client";

import { useState, useEffect } from "react";
import { useOrderStore } from "@/store/orderStore";
import { MENU_CATEGORIES } from "@/data/menu";
import { getAvailableProducts } from "@/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, Search, X } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { type ProductCategory, type Product, PORTIONABLE_CATEGORIES } from "@/types";
import type { PortionOption } from "@/types";
import PortionSelector from "./PortionSelector";
import { ProductImage } from "@/components/products/ProductImage";
import {
  productImage,
  categoryImage,
  fallbackProductUrl,
  fallbackCategoryUrl,
} from "@/lib/images";

const GRID_CLASS =
  "grid gap-2 sm:gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

export default function ProductSelector() {
  const { draft, addItem, addItemWithPortion, updateQuantity } = useOrderStore();
  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [menuItems, setMenuItems] = useState<Product[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);

  useEffect(() => {
    getAvailableProducts()
      .then(setMenuItems)
      .finally(() => setIsLoadingMenu(false));
  }, []);

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const matchesSearch =
      search === "" || item.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getItemTotalQuantity = (productId: string) =>
    draft.items
      .filter((i) => i.product.id === productId)
      .reduce((sum, i) => sum + i.quantity, 0);

  const isPortionable = (product: Product) =>
    PORTIONABLE_CATEGORIES.includes(product.category);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Arama */}
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

      {/* Kategori şeridi */}
      <div className="-mx-px overflow-x-auto scrollbar-hide shrink-0">
        <div className="flex gap-2 sm:gap-3 pb-1 w-max px-px">
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

      {/* Ürün grid */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px pb-2 px-px">
        {isLoadingMenu ? (
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
              const qty = getItemTotalQuantity(product.id);
              const portionable = isPortionable(product);
              return (
                <ProductSelectCard
                  key={product.id}
                  product={product}
                  qty={qty}
                  portionable={portionable}
                  onAdd={() => addItem(product)}
                  onIncrement={() => addItem(product)}
                  onDecrement={() => updateQuantity(product.id, qty - 1)}
                  onPortion={(portion) => addItemWithPortion(product, portion)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Alt Bileşenler ──────────────────────────────────────────────────────────

interface CategoryChipProps {
  label: string;
  emoji: string;
  imageSrc?: string;
  fallbackSrc?: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

function CategoryChip({
  label,
  emoji,
  imageSrc,
  fallbackSrc,
  count,
  isActive,
  onClick,
}: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full pl-1 pr-3 py-1 transition-all shrink-0 ring-1",
        isActive
          ? "bg-foreground text-background ring-foreground shadow-sm"
          : "bg-card text-foreground ring-foreground/10 hover:ring-foreground/25 hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "h-7 w-7 rounded-full overflow-hidden flex items-center justify-center text-sm shrink-0",
          isActive ? "ring-1 ring-background/30" : "ring-1 ring-foreground/8",
        )}
      >
        {imageSrc && fallbackSrc ? (
          <ProductImage
            src={imageSrc}
            alt={label}
            fallbackSrc={fallbackSrc}
            placeholderClassName="h-full w-full"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-linear-to-br from-muted to-muted/40">
            {emoji}
          </div>
        )}
      </div>
      <span className="text-xs font-medium leading-tight whitespace-nowrap">
        {label}
      </span>
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-semibold leading-tight tabular-nums",
          isActive
            ? "bg-background/20 text-background"
            : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

interface ProductSelectCardProps {
  product: Product;
  qty: number;
  portionable: boolean;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onPortion: (portion: PortionOption) => void;
}

function ProductSelectCard({
  product,
  qty,
  portionable,
  onAdd,
  onIncrement,
  onDecrement,
  onPortion,
}: ProductSelectCardProps) {
  const handleCardClick = () => {
    if (portionable) return;
    onAdd();
  };

  return (
    <div
      role={portionable ? undefined : "button"}
      tabIndex={portionable ? -1 : 0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (!portionable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onAdd();
        }
      }}
      className={cn(
        "group relative flex flex-col rounded-xl bg-card ring-1 overflow-hidden transition-all min-w-0",
        qty > 0
          ? "ring-2 ring-primary shadow-sm"
          : "ring-foreground/8 hover:ring-foreground/25 hover:shadow-sm",
        !portionable && "cursor-pointer active:scale-[0.98]",
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
          <div className="absolute right-1.5 top-1.5 flex items-center justify-center min-w-6 h-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-1.5 shadow-md ring-2 ring-background">
            {qty}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5 px-2 py-1.5 min-w-0">
        <p className="font-medium text-[12px] leading-tight line-clamp-2 min-h-[2em] wrap-break-word">
          {product.name}
        </p>
        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="font-bold text-[13px] text-foreground tabular-nums truncate min-w-0">
            {formatCurrency(product.price)}
          </span>

          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {portionable ? (
              <PortionSelector
                product={product}
                onSelect={(_p, portion) => onPortion(portion)}
              />
            ) : qty === 0 ? (
              <Button
                size="sm"
                variant="default"
                className="h-7 w-7 p-0 rounded-full"
                onClick={onAdd}
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
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 w-6 p-0 rounded-full"
                  onClick={onIncrement}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
