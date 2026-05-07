import { type Product, type ProductCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UtensilsCrossed, Plus } from "lucide-react";
import { ProductCard } from "./ProductCard";

interface ProductsListProps {
  isLoading: boolean;
  filteredProducts: Product[];
  activeCategory: ProductCategory | "all";
  searchQuery: string;
  groupedProducts: Array<{
    value: string;
    emoji: string;
    label: string;
    items: Product[];
  }>;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onToggle: (product: Product) => void;
  onAddProduct: () => void;
}

const GRID_CLASS =
  "grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

export function ProductsList({
  isLoading,
  filteredProducts,
  activeCategory,
  searchQuery,
  groupedProducts,
  onEdit,
  onDelete,
  onToggle,
  onAddProduct,
}: ProductsListProps) {
  if (isLoading) {
    return (
      <div className={GRID_CLASS}>
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl bg-card ring-1 ring-foreground/8 overflow-hidden"
          >
            <div className="aspect-square w-full animate-pulse bg-linear-to-br from-muted to-muted/60" />
            <div className="p-3 space-y-2">
              <div className="h-3.5 w-4/5 rounded bg-muted animate-pulse" />
              <div className="h-3 w-2/5 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse mt-2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filteredProducts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <UtensilsCrossed className="mb-4 h-16 w-16 opacity-20" />
          <p className="text-lg font-medium">
            {searchQuery || activeCategory !== "all"
              ? "Ürün bulunamadı"
              : "Henüz ürün yok"}
          </p>
          <p className="mt-1 text-sm">
            {searchQuery || activeCategory !== "all"
              ? "Farklı bir filtre deneyin"
              : "İlk ürünü eklemek için butona tıklayın"}
          </p>
          {!searchQuery && activeCategory === "all" && (
            <Button className="mt-4" onClick={onAddProduct}>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Ürün Ekle
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Tüm kategoriler + arama yokken: kategori başlıklarıyla gruplu görünüm
  if (activeCategory === "all" && !searchQuery) {
    return (
      <div className="space-y-8">
        {groupedProducts.map((group) => (
          <section key={group.value}>
            <header className="mb-3 flex items-center gap-2 sticky top-0 z-10 bg-background/85 backdrop-blur-sm py-1 -mx-px px-px">
              <span className="text-lg">{group.emoji}</span>
              <h2 className="text-base font-semibold tracking-tight">{group.label}</h2>
              <span className="text-xs text-muted-foreground rounded-full bg-muted px-2 py-0.5">
                {group.items.length}
              </span>
              <div className="flex-1 h-px bg-border ml-2" />
            </header>
            <div className={GRID_CLASS}>
              {group.items.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  // Filtreli/aramalı düz grid görünüm
  return (
    <div className={GRID_CLASS}>
      {filteredProducts.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
