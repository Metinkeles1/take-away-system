"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrderStore } from "@/store/orderStore";
import { useMenuStore } from "@/store/menuStore";
import { MENU_CATEGORIES } from "@/data/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Minus, Search, X, ArrowUpDown } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import {
  type ProductCategory,
  type Product,
  type PortionOption,
  PORTION_OPTIONS,
} from "@/types";
import PortionSelector from "./PortionSelector";

const FULL_PORTION =
  PORTION_OPTIONS.find((p) => p.size === "full") ?? PORTION_OPTIONS[0];

const MIN_PORTION_MULT = Math.min(...PORTION_OPTIONS.map((p) => p.multiplier));
const MAX_PORTION_MULT = Math.max(...PORTION_OPTIONS.map((p) => p.multiplier));
import { ProductImage } from "@/components/products/ProductImage";
import {
  productImage,
  categoryImage,
  fallbackProductUrl,
  fallbackCategoryUrl,
} from "@/lib/images";

const GRID_CLASS =
  "grid gap-2 sm:gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-4 2xl:grid-cols-5";

// Menü sıralama seçenekleri — varsayılan: en çok satılan.
type SortOption = "popular" | "least" | "default";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "popular", label: "En çok satılan" },
  { value: "least", label: "En az satılan" },
  { value: "default", label: "Menü sırası" },
];

export default function ProductSelector() {
  const draft = useOrderStore((s) => s.draft);
  const addItem = useOrderStore((s) => s.addItem);
  const addItemWithPortion = useOrderStore((s) => s.addItemWithPortion);
  const updateQuantity = useOrderStore((s) => s.updateQuantity);
  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const menuItems = useMenuStore((s) => s.items);
  const salesRank = useMenuStore((s) => s.salesRank);
  const loadMenu = useMenuStore((s) => s.loadMenu);
  const hasCache = menuItems.length > 0;
  const isLoadingMenu = !hasCache;

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  // Search'i normalize edip filter loop'u dışına çıkar — her item için lower oluşmasın
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = menuItems.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });

    // "default" → menuItems zaten kategori/sıra düzeninde geliyor, dokunma.
    if (sortBy === "default") return filtered;

    const dir = sortBy === "popular" ? -1 : 1;
    // Satışı olmayan ürünler 0 sayılır; en çok satılanda en sona, en azda en başa düşer.
    return [...filtered].sort((a, b) => {
      const sa = salesRank[a.id] ?? 0;
      const sb = salesRank[b.id] ?? 0;
      if (sa !== sb) return (sa - sb) * dir;
      return a.name.localeCompare(b.name, "tr");
    });
  }, [menuItems, activeCategory, search, sortBy, salesRank]);

  // Sepetteki ürünlerin toplam adedi — kart başına filter+reduce yerine O(1) lookup
  const cartQuantities = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of draft.items) {
      m.set(i.product.id, (m.get(i.product.id) ?? 0) + i.quantity);
    }
    return m;
  }, [draft.items]);

  const isPortionable = (product: Product) => Boolean(product.portionable);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Arama + sıralama */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1 min-w-0">
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
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger
            className="h-11 w-11 px-0 justify-center sm:w-auto sm:px-3 shrink-0 [&>svg:last-child]:hidden sm:[&>svg:last-child]:block"
            aria-label="Sıralama"
          >
            <ArrowUpDown className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kategori şeridi — mobilde yatay scroll, sm+ wrap (tüm chip'ler tek/iki satıra ferah dağılır) */}
      <div className="relative shrink-0">
        <div className="-mx-px overflow-x-auto sm:overflow-visible scrollbar-hide">
          <div className="flex gap-2 pb-1 w-max sm:w-auto sm:flex-wrap px-px">
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
        {/* Sağ kenar fade — sadece mobilde scroll cue, sm+ wrap olduğu için kapalı */}
        <div className="sm:hidden pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-linear-to-l from-background to-transparent" />
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
              const qty = cartQuantities.get(product.id) ?? 0;
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
                  onAddPortion={(portion) => addItemWithPortion(product, portion)}
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
  onAddPortion: (portion: PortionOption) => void;
}

function ProductSelectCard({
  product,
  qty,
  portionable,
  onAdd,
  onIncrement,
  onDecrement,
  onAddPortion,
}: ProductSelectCardProps) {
  // Tek tık akışı: porsiyonlu ürünlerde de karta tıklamak doğrudan 1 porsiyon ekler.
  // Pill'ler (½ / 1 / 1½) yarım veya bir buçuk seçmek isteyene tek tıkla alternatif sunar.
  const handleCardClick = () => {
    if (portionable) {
      onAddPortion(FULL_PORTION);
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
        // Off-screen kartları tarayıcı render etmiyor — uzun grid'lerde scroll çok rahat.
        "[content-visibility:auto] [contain-intrinsic-size:auto_240px]",
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
              onSelect={onAddPortion}
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
