import { useState, memo } from "react";
import { deleteProduct } from "@/actions/products";
import { type Product } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DeleteProductDialogProps {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteProductDialog = memo(function DeleteProductDialog({
  product,
  onClose,
  onSuccess,
}: DeleteProductDialogProps) {
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
