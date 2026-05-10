import { memo, useState } from "react";
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
import { type SavedCustomer } from "@/types";
import { deleteCustomer } from "@/actions/customers";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DeleteCustomerDialogProps {
  customer: SavedCustomer | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteCustomerDialog = memo(function DeleteCustomerDialog({
  customer,
  onClose,
  onSuccess,
}: DeleteCustomerDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleDelete = async () => {
    if (!customer) return;
    setIsSaving(true);
    try {
      await deleteCustomer(customer.id);
      toast.success("Müşteri silindi");
      onClose();
      onSuccess();
    } catch {
      toast.error("Müşteri silinirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AlertDialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Müşteriyi Sil</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{customer?.name}</strong> adlı müşteriyi silmek istediğinize emin
            misiniz? Bu işlem geri alınamaz.
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
