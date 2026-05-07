"use client";

import { type ProductCategory } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "./ProductImage";
import { categoryImage, fallbackCategoryUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

interface ProductsFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeCategory: ProductCategory | "all";
  onCategoryChange: (category: ProductCategory | "all") => void;
  products: Array<{ category: ProductCategory }>;
}

export function ProductsFilters({
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  products,
}: ProductsFiltersProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 shrink-0">
      {/* Arama */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Ürün ara..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-10 h-11"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={() => onSearchChange("")}
            aria-label="Aramayı temizle"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Kategori şeridi — yatay scroll */}
      <div className="-mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 sm:gap-3 pb-1 w-max">
          <CategoryChip
            label="Tümü"
            emoji="🍽️"
            count={products.length}
            isActive={activeCategory === "all"}
            onClick={() => onCategoryChange("all")}
          />
          {MENU_CATEGORIES.map((cat) => {
            const count = products.filter((p) => p.category === cat.value).length;
            return (
              <CategoryChip
                key={cat.value}
                label={cat.label}
                emoji={cat.emoji}
                imageSrc={categoryImage(cat.value)}
                fallbackSrc={fallbackCategoryUrl(cat.value)}
                count={count}
                isActive={activeCategory === cat.value}
                onClick={() => onCategoryChange(cat.value)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
        "group flex flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 transition-all shrink-0 min-w-19.5",
        isActive
          ? "bg-foreground text-background shadow-md"
          : "bg-card ring-1 ring-foreground/8 hover:ring-foreground/20 hover:-translate-y-0.5",
      )}
    >
      <div
        className={cn(
          "h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden flex items-center justify-center text-2xl shrink-0 transition-all",
          isActive ? "ring-2 ring-background/40" : "ring-1 ring-foreground/8",
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
          <div
            className={cn(
              "h-full w-full flex items-center justify-center bg-linear-to-br",
              isActive
                ? "from-background/20 to-background/5"
                : "from-muted to-muted/40",
            )}
          >
            {emoji}
          </div>
        )}
      </div>
      <span
        className={cn(
          "text-xs font-medium leading-tight whitespace-nowrap",
          isActive ? "text-background" : "text-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-semibold leading-tight",
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
