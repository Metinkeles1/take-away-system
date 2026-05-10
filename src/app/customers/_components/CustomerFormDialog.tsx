import { memo, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { type SavedCustomer } from "@/types";
import { createCustomer, updateCustomer } from "@/actions/customers";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CustomerFormState {
  name: string;
  phone: string;
  address: string;
  addressDetail: string;
}

const EMPTY_FORM: CustomerFormState = {
  name: "",
  phone: "",
  address: "",
  addressDetail: "",
};

function fromCustomer(c: SavedCustomer): CustomerFormState {
  return {
    name: c.name,
    phone: c.phone,
    address: c.address,
    addressDetail: c.addressDetail ?? "",
  };
}

function validate(form: CustomerFormState): string | null {
  if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) {
    return "Ad, telefon ve adres zorunludur";
  }
  return null;
}

function toPayload(form: CustomerFormState) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    address: form.address.trim(),
    addressDetail: form.addressDetail.trim() || undefined,
  };
}

function CustomerFormFields({
  formData,
  setFormData,
}: {
  formData: CustomerFormState;
  setFormData: React.Dispatch<React.SetStateAction<CustomerFormState>>;
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="name">Ad Soyad *</Label>
        <Input
          id="name"
          placeholder="Müşteri adı"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Telefon *</Label>
        <Input
          id="phone"
          placeholder="05XX XXX XX XX"
          value={formData.phone}
          onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="address">Adres *</Label>
        <Input
          id="address"
          placeholder="Müşteri adresi"
          value={formData.address}
          onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="addressDetail">Adres Detayı</Label>
        <Input
          id="addressDetail"
          placeholder="Daire, kat vb."
          value={formData.addressDetail}
          onChange={(e) =>
            setFormData((p) => ({ ...p, addressDetail: e.target.value }))
          }
        />
      </div>
    </div>
  );
}

interface CustomerFormDialogProps {
  /** null/undefined = ekleme modu, SavedCustomer = düzenleme modu */
  editing?: SavedCustomer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CustomerFormDialog = memo(function CustomerFormDialog({
  editing,
  open,
  onOpenChange,
  onSuccess,
}: CustomerFormDialogProps) {
  const isEdit = !!editing;
  const [formData, setFormData] = useState<CustomerFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormData(editing ? fromCustomer(editing) : EMPTY_FORM);
  }, [open, editing]);

  const handleSubmit = async () => {
    const error = validate(formData);
    if (error) {
      toast.error(error);
      return;
    }
    setIsSaving(true);
    try {
      if (isEdit && editing) {
        await updateCustomer(editing.id, toPayload(formData));
        toast.success("Müşteri güncellendi");
      } else {
        await createCustomer({ id: crypto.randomUUID(), ...toPayload(formData) });
        toast.success("Müşteri eklendi");
      }
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error(
        isEdit ? "Müşteri güncellenirken hata oluştu" : "Müşteri eklenirken hata oluştu",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Müşteri Düzenle" : "Yeni Müşteri Ekle"}</DialogTitle>
        </DialogHeader>
        <CustomerFormFields formData={formData} setFormData={setFormData} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Kaydet" : "Ekle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
