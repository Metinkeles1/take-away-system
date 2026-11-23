import { useEffect, useState, memo } from "react";
import { createProduct } from "@/actions/products";
import { uploadImageFile } from "./uploadImage";
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
import type { CategoryOptions } from "@/types";
import { useMenuCategories } from "@/store/categoryStore";

const emptyForm: ProductFormState = {
  name: "",
  price: "",
  category: "kebap",
  description: "",
  available: true,
  portionable: false,
  hiddenOptions: [],
  imageUrl: "",
  imageFile: null,
};

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  categoryOptions: CategoryOptions | null;
  /** Açılışta seçili gelecek kategori (Menü'de o an açık olan). */
  defaultCategory?: string;
}

export const AddProductDialog = memo(function AddProductDialog({
  open,
  onOpenChange,
  onSuccess,
  categoryOptions,
  defaultCategory,
}: AddProductDialogProps) {
  const categories = useMenuCategories();
  const [formData, setFormData] = useState<ProductFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const valid = categories.some((c) => c.value === defaultCategory);
    setFormData({ ...emptyForm, category: valid ? defaultCategory! : (categories[0]?.value ?? emptyForm.category) });
    // categories bilinçli olarak dışarıda: dialog açıkken liste tazelenirse form sıfırlanmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultCategory]);

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
        imageUrl = await uploadImageFile(formData.imageFile, id, formData.name.trim());
      }

      await createProduct({
        id,
        name: formData.name.trim(),
        price,
        category: formData.category,
        description: formData.description.trim() || undefined,
        available: true,
        portionable: formData.portionable,
        hiddenOptions: keepCategoryOptionIds(formData, categoryOptions),
        image: imageUrl,
      });
      toast.success("Ürün eklendi");
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      console.error(e);
      // Resim hatası kendi açıklamasını taşır (çok büyük / yüklenemedi)
      toast.error("Ürün eklenirken hata oluştu", {
        description: e instanceof Error && e.message.startsWith("Resim") ? e.message : undefined,
      });
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
        <ProductFormFields
          formData={formData}
          setFormData={setFormData}
          categoryOptions={categoryOptions}
        />
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
