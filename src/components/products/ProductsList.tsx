import { type Product, type ProductCategory } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-lg border p-4 flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-5 w-16" />
            <div className="flex gap-1">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
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

  if (activeCategory === "all" && !searchQuery) {
    // Grouped view
    return (
      <div className="space-y-6">
        {groupedProducts.map((group) => (
          <div key={group.value}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>{group.emoji}</span>
              {group.label}
              <span className="text-xs font-normal">({group.items.length})</span>
            </h2>
            <div className="space-y-2">
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
          </div>
        ))}
      </div>
    );
  }

  // Flat filtered view
  return (
    <div className="space-y-2">
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
