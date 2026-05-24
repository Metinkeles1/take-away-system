import { useEffect, useState, memo } from "react";
import { createProduct } from "@/actions/products";
import { uploadProductImage } from "@/actions/productImages";
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
import { ProductFormFields, type ProductFormState } from "./ProductFormFields";

const emptyForm: ProductFormState = {
  name: "",
  price: "",
  category: "kebap",
  description: "",
  available: true,
  portionable: false,
  imageUrl: "",
  imageFile: null,
};

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const AddProductDialog = memo(function AddProductDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddProductDialogProps) {
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
      const id = crypto.randomUUID();

      let imageUrl: string | undefined = formData.imageUrl || undefined;
      if (formData.imageFile) {
        const fd = new FormData();
        fd.append("file", formData.imageFile);
        fd.append("productId", id);
        fd.append("productName", formData.name.trim());
        const { url } = await uploadProductImage(fd);
        imageUrl = url;
      }

      await createProduct({
        id,
        name: formData.name.trim(),
        price,
        category: formData.category,
        description: formData.description.trim() || undefined,
        available: true,
        portionable: formData.portionable,
        image: imageUrl,
      });
      toast.success("Ürün eklendi");
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      console.error(e);
      toast.error("Ürün eklenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        aria-describedby={undefined}
      >
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
