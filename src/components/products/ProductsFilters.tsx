import { type ProductCategory } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

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
    <>
      {/* Search */}
      <div className="flex gap-3 mb-4 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ürün ara..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-4 shrink-0">
        <button
          onClick={() => onCategoryChange("all")}
          className={`
rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${activeCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          🍽️ Tümü ({products.length})
        </button>
        {MENU_CATEGORIES.map((cat) => {
          const count = products.filter((p) => p.category === cat.value).length;
          return (
            <button
              key={cat.value}
              onClick={() => onCategoryChange(cat.value)}
              className={`
rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${activeCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {cat.emoji} {cat.label} ({count})
            </button>
          );
        })}
      </div>
    </>
  );
}
