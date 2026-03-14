"use client";

import { useState } from "react";
import { useOrderStore, selectSubtotal, selectTotal } from "@/store/orderStore";
import { MENU_ITEMS, MENU_CATEGORIES } from "@/data/menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Plus, Minus, Trash2, ShoppingCart, Search, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { type ProductCategory } from "@/types";

export default function ProductSelector() {
  const { draft, addItem, removeItem, updateQuantity, setStep } = useOrderStore();
  const subtotal = useOrderStore(selectSubtotal);
  const total = useOrderStore(selectTotal);
  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");

  const filteredItems = MENU_ITEMS.filter((item) => {
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const matchesSearch =
      search === "" || item.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch && item.available;
  });

  const getItemQuantity = (productId: string) => {
    const item = draft.items.find((i) => i.product.id === productId);
    return item?.quantity ?? 0;
  };

  const totalItems = draft.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="h-full grid gap-6 lg:grid-cols-3">
      {/* Sol: Menü */}
      <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
        {/* Arama */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ürün ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Kategori sekmeleri */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveCategory("all")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            🍽️ Tümü
          </button>
          {MENU_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        {/* Ürün grid */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px pb-2 px-px">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="mb-3 h-10 w-10 opacity-30" />
              <p>Ürün bulunamadı</p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredItems.map((product) => {
                const qty = getItemQuantity(product.id);
                return (
                  <Card
                    key={product.id}
                    className={`transition-all cursor-pointer ${
                      qty > 0 ? "border-primary shadow-sm" : "hover:shadow-sm"
                    }`}
                  >
                    <CardContent className="flex items-center justify-between p-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm leading-tight">
                            {product.name}
                          </p>
                          {qty > 0 && <Badge className="h-5 px-1.5 text-xs">{qty}</Badge>}
                        </div>
                        {product.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {product.description}
                          </p>
                        )}
                        <p className="text-sm font-bold text-primary mt-1">
                          {formatCurrency(product.price)}
                        </p>
                      </div>

                      {/* Miktar kontrol */}
                      {qty === 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 shrink-0"
                          onClick={() => addItem(product)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => updateQuantity(product.id, qty - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm font-bold">{qty}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => addItem(product)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sağ: Sepet */}
      <div className="flex flex-col min-h-0">
        <Card className="flex flex-col h-full">
          <CardContent className="flex flex-col flex-1 min-h-0 p-4">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-base">Sipariş Sepeti</h3>
              {totalItems > 0 && <Badge className="ml-auto">{totalItems} ürün</Badge>}
            </div>

            {draft.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <ShoppingCart className="mb-2 h-10 w-10 opacity-20" />
                <p className="text-sm">Sepet boş</p>
                <p className="text-xs mt-1">Ürün eklemek için + butonuna tıklayın</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1">
                  {draft.items.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/50 p-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} x {formatCurrency(item.product.price)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-sm font-bold text-primary">
                          {formatCurrency(item.totalPrice)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeItem(item.product.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-3" />

                {/* Özet */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Ara Toplam</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Toplam</span>
                    <span className="text-primary">{formatCurrency(total)}</span>
                  </div>
                </div>

                <Button
                  className="mt-4 w-full"
                  disabled={draft.items.length === 0}
                  onClick={() => setStep("customer")}
                >
                  Müşteri Bilgisi
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
