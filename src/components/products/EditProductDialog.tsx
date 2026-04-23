import { useEffect, useState, memo } from "react";
import { updateProduct } from "@/actions/products";
import { type Product, type ProductCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ProductFormFields } from "./ProductFormFields";

interface ProductFormState {
  name: string;
  price: string;
  category: ProductCategory;
  description: string;
  available: boolean;
}

interface EditProductDialogProps {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditProductDialog = memo(function EditProductDialog({
  product,
  onClose,
  onSuccess,
}: EditProductDialogProps) {
  const [formData, setFormData] = useState<ProductFormState>({
    name: "",
    price: "",
    category: "kebap",
    description: "",
    available: true,
  });
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
