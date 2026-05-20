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
import { type Corporate } from "@/types";
import { deleteCorporate } from "@/actions/corporate";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DeleteCorporateDialogProps {
  corp: Corporate | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteCorporateDialog = memo(function DeleteCorporateDialog({
  corp,
  onClose,
  onSuccess,
}: DeleteCorporateDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleDelete = async () => {
    if (!corp) return;
    setIsSaving(true);
    try {
      await deleteCorporate(corp.id);
      toast.success("Silindi");
      onClose();
      onSuccess();
    } catch {
      toast.error("Silinirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AlertDialog open={!!corp} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kurumsal Müşteriyi Sil</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{corp?.name}</strong> silinecek. Bu işletmeye ait <em>fişler korunur</em>{" "}
            (geçmiş kayıt için), ancak işletme listede görünmez.
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
