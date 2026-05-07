"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getProducts,
  toggleProductAvailability,
  seedProducts,
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
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getProducts();
      setProducts(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // İlk açılışta DB boşsa seed et
  useEffect(() => {
    if (!isLoading && products.length === 0) {
      seedProducts().then((count) => {
        if (count > 0) {
          toast.success(`${count} ürün menüden aktarıldı`);
          loadProducts();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const filteredProducts = products.filter((p) => {
    const matchCategory = activeCategory === "all" || p.category === activeCategory;
    const matchSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  // Group by category for display
  const groupedProducts = MENU_CATEGORIES.reduce(
    (acc, cat) => {
      const items = filteredProducts.filter((p) => p.category === cat.value);
      if (items.length > 0) acc.push({ ...cat, items });
      return acc;
    },
    [] as ((typeof MENU_CATEGORIES)[number] & { items: Product[] })[],
  );

  const handleOpenEdit = useCallback((product: Product) => setEditingProduct(product), []);
  const handleOpenDelete = useCallback((product: Product) => setDeletingProduct(product), []);
  const handleCloseEdit = useCallback(() => setEditingProduct(null), []);
  const handleCloseDelete = useCallback(() => setDeletingProduct(null), []);

  const handleToggle = useCallback(
    async (product: Product) => {
      await toggleProductAvailability(product.id);
      toast.success(`${product.name} ${product.available ? "pasif" : "aktif"} yapıldı`);
      loadProducts();
    },
    [loadProducts],
  );

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
    <main className="h-full flex flex-col px-4 pt-4 pb-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      <ProductsHeader
        totalProducts={products.length}
        activeProducts={products.filter((p) => p.available).length}
        onExportCSV={handleExportCSV}
        onAddProduct={() => setShowAddDialog(true)}
      />

      <ProductsFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        products={products}
      />

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        <ProductsList
          isLoading={isLoading}
          filteredProducts={filteredProducts}
          activeCategory={activeCategory}
          searchQuery={searchQuery}
          groupedProducts={groupedProducts}
          onEdit={handleOpenEdit}
          onDelete={handleOpenDelete}
          onToggle={handleToggle}
          onAddProduct={() => setShowAddDialog(true)}
        />
      </div>

      <AddProductDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={loadProducts}
      />
      <EditProductDialog
        product={editingProduct}
        onClose={handleCloseEdit}
        onSuccess={loadProducts}
      />
      <DeleteProductDialog
        product={deletingProduct}
        onClose={handleCloseDelete}
        onSuccess={loadProducts}
      />
    </main>
  );
}
