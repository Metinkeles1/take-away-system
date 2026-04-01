"use client";

import { useEffect, useState, useCallback, memo } from "react";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductAvailability,
  seedProducts,
} from "@/actions/products";
import { type Product, type ProductCategory } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  UtensilsCrossed,
  Download,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────
interface ProductFormState {
  name: string;
  price: string;
  category: ProductCategory;
  description: string;
  available: boolean;
}

const emptyForm: ProductFormState = {
  name: "",
  price: "",
  category: "kebap",
  description: "",
  available: true,
};

const CATEGORY_MAP = Object.fromEntries(
  MENU_CATEGORIES.map((c) => [c.value, c]),
) as Record<ProductCategory, (typeof MENU_CATEGORIES)[number]>;

// ─── ProductCard (memo) ────────────────────────────────────────────────────
const ProductCard = memo(function ProductCard({
  product,
  onEdit,
  onDelete,
  onToggle,
}: {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onToggle: (product: Product) => void;
}) {
  const cat = CATEGORY_MAP[product.category];
  return (
    <Card
      className={`transition-shadow hover:shadow-md ${!product.available ? "opacity-60" : ""}`}
    >
      <CardContent className="flex items-center gap-4 p-4">
        {/* Emoji */}
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl">
          {cat?.emoji ?? "🍽️"}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-base truncate">{product.name}</p>
            {!product.available && (
              <Badge variant="outline" className="text-muted-foreground">
                Pasif
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="secondary" className="text-xs">
              {cat?.label ?? product.category}
            </Badge>
            {product.description && (
              <span className="text-xs text-muted-foreground truncate">
                {product.description}
              </span>
            )}
          </div>
        </div>

        {/* Price + Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-base whitespace-nowrap">
            {formatCurrency(product.price)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onToggle(product)}
            title={product.available ? "Pasif yap" : "Aktif yap"}
          >
            {product.available ? (
              <Eye className="h-4 w-4 text-green-600" />
            ) : (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(product)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(product)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

// ─── ProductFormFields ─────────────────────────────────────────────────────
function ProductFormFields({
  formData,
  setFormData,
}: {
  formData: ProductFormState;
  setFormData: React.Dispatch<React.SetStateAction<ProductFormState>>;
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="product-name">Ürün Adı *</Label>
        <Input
          id="product-name"
          placeholder="Ürün adı"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="product-price">Fiyat (₺) *</Label>
          <Input
            id="product-price"
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={formData.price}
            onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <Label>Kategori *</Label>
          <Select
            value={formData.category}
            onValueChange={(v) =>
              setFormData((p) => ({ ...p, category: v as ProductCategory }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MENU_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.emoji} {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="product-desc">Açıklama</Label>
        <Input
          id="product-desc"
          placeholder="Opsiyonel açıklama"
          value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
        />
      </div>
    </div>
  );
}

// ─── AddProductDialog ──────────────────────────────────────────────────────
const AddProductDialog = memo(function AddProductDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState<ProductFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) setFormData(emptyForm);
  }, [open]);

  const handleAdd = async () => {
    if (!formData.name.trim() || !formData.price) {
      toast.error("Ürün adı ve fiyat zorunludur");
      return;
    }
    const price = Number(formData.price);
    if (isNaN(price) || price < 0) {
      toast.error("Geçerli bir fiyat giriniz");
      return;
    }
    setIsSaving(true);
    try {
      await createProduct({
        name: formData.name.trim(),
        price,
        category: formData.category,
        description: formData.description.trim() || undefined,
        available: true,
      });
      toast.success("Ürün eklendi");
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Ürün eklenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Yeni Ürün Ekle</DialogTitle>
        </DialogHeader>
        <ProductFormFields formData={formData} setFormData={setFormData} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={handleAdd} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ekle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

// ─── EditProductDialog ─────────────────────────────────────────────────────
const EditProductDialog = memo(function EditProductDialog({
  product,
  onClose,
  onSuccess,
}: {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState<ProductFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        price: String(product.price),
        category: product.category,
        description: product.description ?? "",
        available: product.available,
      });
    }
  }, [product]);

  const handleEdit = async () => {
    if (!product) return;
    if (!formData.name.trim() || !formData.price) {
      toast.error("Ürün adı ve fiyat zorunludur");
      return;
    }
    const price = Number(formData.price);
    if (isNaN(price) || price < 0) {
      toast.error("Geçerli bir fiyat giriniz");
      return;
    }
    setIsSaving(true);
    try {
      await updateProduct(product.id, {
        name: formData.name.trim(),
        price,
        category: formData.category,
        description: formData.description.trim() || undefined,
        available: formData.available,
      });
      toast.success("Ürün güncellendi");
      onClose();
      onSuccess();
    } catch {
      toast.error("Ürün güncellenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Ürün Düzenle</DialogTitle>
        </DialogHeader>
        <ProductFormFields formData={formData} setFormData={setFormData} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            İptal
          </Button>
          <Button onClick={handleEdit} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

// ─── DeleteProductDialog ───────────────────────────────────────────────────
const DeleteProductDialog = memo(function DeleteProductDialog({
  product,
  onClose,
  onSuccess,
}: {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const handleDelete = async () => {
    if (!product) return;
    setIsSaving(true);
    try {
      await deleteProduct(product.id);
      toast.success("Ürün silindi");
      onClose();
      onSuccess();
    } catch {
      toast.error("Ürün silinirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AlertDialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ürünü Sil</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{product?.name}</strong> adlı ürünü silmek istediğinize emin misiniz? Bu işlem
            geri alınamaz.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>İptal</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isSaving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sil
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

// ─── Main Page ─────────────────────────────────────────────────────────────
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
      const cat = CATEGORY_MAP[p.category];
      return [
        escape(p.name),
        p.price,
        escape(cat?.label ?? p.category),
        p.available ? "Aktif" : "Pasif",
        escape(p.description ?? ""),
      ].join(",");
    });
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `urunler_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${products.length} ürün CSV olarak indirildi`);
  }, [products]);

  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-4 pb-4 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Menü Yönetimi</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Toplam {products.length} ürün · {products.filter((p) => p.available).length} aktif
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni Ürün
          </Button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-4 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ürün ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-4 shrink-0">
        <button
          onClick={() => setActiveCategory("all")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            activeCategory === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          🍽️ Tümü ({products.length})
        </button>
        {MENU_CATEGORIES.map((cat) => {
          const count = products.filter((p) => p.category === cat.value).length;
          return (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat.emoji} {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Product List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        {isLoading ? (
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
        ) : filteredProducts.length === 0 ? (
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
                <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Yeni Ürün Ekle
                </Button>
              )}
            </CardContent>
          </Card>
        ) : activeCategory === "all" && !searchQuery ? (
          // Grouped view
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
                      onEdit={handleOpenEdit}
                      onDelete={handleOpenDelete}
                      onToggle={handleToggle}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat filtered view
          <div className="space-y-2">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
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
