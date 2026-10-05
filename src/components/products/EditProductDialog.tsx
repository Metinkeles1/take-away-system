import { useEffect, useState, memo } from "react";
import { updateProduct } from "@/actions/products";
import { uploadImageFile } from "./uploadImage";
import { type CategoryOptions, type Product } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ProductFormFields,
  keepCategoryOptionIds,
  type ProductFormState,
} from "./ProductFormFields";

interface EditProductDialogProps {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
  categoryOptions: CategoryOptions | null;
}

export const EditProductDialog = memo(function EditProductDialog({
  product,
  onClose,
  onSuccess,
  categoryOptions,
}: EditProductDialogProps) {
  const [formData, setFormData] = useState<ProductFormState>({
    name: "",
    price: "",
    category: "kebap",
    description: "",
    available: true,
    portionable: false,
    hiddenOptions: [],
    imageUrl: "",
    imageFile: null,
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
        portionable: Boolean(product.portionable),
        hiddenOptions: product.hiddenOptions ?? [],
        imageUrl: product.image ?? "",
        imageFile: null,
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
      let imageUrl: string | undefined = formData.imageUrl || undefined;
      if (formData.imageFile) {
        imageUrl = await uploadImageFile(formData.imageFile, product.id, formData.name.trim());
      }

      await updateProduct(product.id, {
        name: formData.name.trim(),
        price,
        category: formData.category,
        description: formData.description.trim() || undefined,
        available: formData.available,
        portionable: formData.portionable,
        hiddenOptions: keepCategoryOptionIds(formData, categoryOptions),
        image: imageUrl,
      });
      toast.success("Ürün güncellendi");
      onClose();
      onSuccess();
    } catch (e) {
      console.error(e);
      // Resim hatası kendi açıklamasını taşır (çok büyük / yüklenemedi)
      toast.error("Ürün güncellenirken hata oluştu", {
        description: e instanceof Error && e.message.startsWith("Resim") ? e.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Ürün Düzenle</DialogTitle>
        </DialogHeader>
        <ProductFormFields
          formData={formData}
          setFormData={setFormData}
          categoryOptions={categoryOptions}
        />
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
