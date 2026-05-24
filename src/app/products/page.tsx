"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  getProducts,
  toggleProductAvailability,
  seedProducts,
  backfillProductPortions,
} from "@/actions/products";
import { type Product, type ProductCategory } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { toast } from "sonner";
import { ProductsHeader } from "@/components/products/ProductsHeader";
import { ProductsFilters } from "@/components/products/ProductsFilters";
import { ProductsList } from "@/components/products/ProductsList";
import { AddProductDialog } from "@/components/products/AddProductDialog";
import { EditProductDialog } from "@/components/products/EditProductDialog";
import { DeleteProductDialog } from "@/components/products/DeleteProductDialog";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all");

  // Yazarken her keystroke filter/group/render tetiklemesin — React deferred
  // value, input'u öncelikli render eder, ağır listeyi arkada günceller.
  const deferredSearch = useDeferredValue(searchQuery);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  // İlk yüklemede skeleton göster; sonraki revalidation'larda sessiz refresh.
  const initialLoadDoneRef = useRef(false);

  const loadProducts = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setIsInitialLoad(true);
    try {
      const data = await getProducts();
      setProducts(data);
    } finally {
      setIsInitialLoad(false);
      initialLoadDoneRef.current = true;
    }
  }, []);

  useEffect(() => {
    void loadProducts(true);
  }, [loadProducts]);

  // İlk açılışta DB boşsa menüyü seed et (yalnızca bir kez)
  const seedAttemptedRef = useRef(false);
  useEffect(() => {
    if (!initialLoadDoneRef.current || seedAttemptedRef.current) return;
    if (products.length > 0) return;
    seedAttemptedRef.current = true;
    seedProducts().then((count) => {
      if (count > 0) {
        toast.success(`${count} ürün menüden aktarıldı`);
        void loadProducts();
      }
    });
  }, [products.length, loadProducts]);

  // Tek seferlik porsiyon backfill: kebap/pide/dürüm ürünlerine portionable=true
  // atar. Tüm ürünler güncel olunca sessizce 0 döner, bir daha hiçbir şey yapmaz.
  const portionBackfillDoneRef = useRef(false);
  useEffect(() => {
    if (!initialLoadDoneRef.current || portionBackfillDoneRef.current) return;
    if (products.length === 0) return;
    portionBackfillDoneRef.current = true;
    backfillProductPortions().then((count) => {
      if (count > 0) {
        toast.success(`${count} ürünün porsiyon seçeneği geri yüklendi`);
        void loadProducts();
      }
    });
  }, [products.length, loadProducts]);

  // Filtreler — tek geçiş, memoized. searchQuery'nin deferred sürümünü kullan.
  const filteredProducts = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory !== "all" && p.category !== activeCategory) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, activeCategory, deferredSearch]);

  // Kategori başlıklı görünüm yalnızca "Tümü + arama yok" durumunda gösteriliyor.
  // O yüzden sadece o durumda group hesapla.
  const groupedProducts = useMemo(() => {
    if (activeCategory !== "all" || deferredSearch) return [];
    const byCategory = new Map<ProductCategory, Product[]>();
    for (const p of filteredProducts) {
      const arr = byCategory.get(p.category);
      if (arr) arr.push(p);
      else byCategory.set(p.category, [p]);
    }
    return MENU_CATEGORIES.flatMap((cat) => {
      const items = byCategory.get(cat.value);
      return items && items.length > 0 ? [{ ...cat, items }] : [];
    });
  }, [filteredProducts, activeCategory, deferredSearch]);

  const activeProductsCount = useMemo(
    () => products.filter((p) => p.available).length,
    [products],
  );

  const handleOpenEdit = useCallback((product: Product) => setEditingProduct(product), []);
  const handleOpenDelete = useCallback((product: Product) => setDeletingProduct(product), []);
  const handleCloseEdit = useCallback(() => setEditingProduct(null), []);
  const handleCloseDelete = useCallback(() => setDeletingProduct(null), []);
  const handleOpenAdd = useCallback(() => setShowAddDialog(true), []);

  // Optimistic toggle: anında UI patch, hata olursa geri al.
  const handleToggle = useCallback(async (product: Product) => {
    const id = product.id;
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, available: !p.available } : p)),
    );
    toast.success(`${product.name} ${product.available ? "pasif" : "aktif"} yapıldı`);
    try {
      await toggleProductAvailability(id);
    } catch {
      // Sunucu reddetti — geri al
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, available: product.available } : p)),
      );
      toast.error("Durum değiştirilemedi");
    }
  }, []);

  // Add/edit/delete sonrası silent revalidation (skeleton göstermeden refetch).
  const handleSilentReload = useCallback(() => void loadProducts(false), [loadProducts]);

  const handleExportCSV = useCallback(() => {
    if (products.length === 0) {
      toast.error("İndirilecek ürün bulunamadı");
      return;
    }
    const header = "Ürün Adı,Fiyat,Kategori,Durum,Açıklama";
    const rows = products.map((p) => {
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const cat = MENU_CATEGORIES.find((c) => c.value === p.category);
      return [
        escape(p.name),
        p.price,
        escape(cat?.label ?? p.category),
        p.available ? "Aktif" : "Pasif",
        escape(p.description ?? ""),
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "urunler_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${products.length} ürün CSV olarak indirildi`);
  }, [products]);

  return (
    <main className="h-full flex flex-col px-3 pt-3 pb-6 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 lg:pb-8 overflow-y-auto lg:overflow-hidden">
      <ProductsHeader
        totalProducts={products.length}
        activeProducts={activeProductsCount}
        onExportCSV={handleExportCSV}
        onAddProduct={handleOpenAdd}
      />

      <ProductsFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        products={products}
      />

      <div className="flex-1 lg:min-h-0 lg:overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        <ProductsList
          isLoading={isInitialLoad}
          filteredProducts={filteredProducts}
          activeCategory={activeCategory}
          searchQuery={deferredSearch}
          groupedProducts={groupedProducts}
          onEdit={handleOpenEdit}
          onDelete={handleOpenDelete}
          onToggle={handleToggle}
          onAddProduct={handleOpenAdd}
        />
      </div>

      <AddProductDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={handleSilentReload}
      />
      <EditProductDialog
        product={editingProduct}
        onClose={handleCloseEdit}
        onSuccess={handleSilentReload}
      />
      <DeleteProductDialog
        product={deletingProduct}
        onClose={handleCloseDelete}
        onSuccess={handleSilentReload}
      />
    </main>
  );
}
