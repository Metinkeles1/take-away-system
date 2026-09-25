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
import { type CustomerAddress, type SavedCustomer } from "@/types";
import { createCustomer, updateCustomer } from "@/actions/customers";
import { CustomerAddressSection } from "./CustomerAddressSection";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface NamePhoneState {
  name: string;
  phone: string;
}

interface CreateFormState extends NamePhoneState {
  address: string;
  addressDetail: string;
}

const EMPTY_FORM: CreateFormState = {
  name: "",
  phone: "",
  address: "",
  addressDetail: "",
};

function fromCustomer(c: SavedCustomer): NamePhoneState {
  return { name: c.name, phone: c.phone };
}

function validateNamePhone(form: NamePhoneState): string | null {
  if (!form.name.trim() || !form.phone.trim()) {
    return "Ad ve telefon zorunludur";
  }
  return null;
}

function validateCreate(form: CreateFormState): string | null {
  if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) {
    return "Ad, telefon ve adres zorunludur";
  }
  return null;
}

function NamePhoneFields({
  formData,
  setFormData,
}: {
  formData: NamePhoneState;
  setFormData: React.Dispatch<React.SetStateAction<NamePhoneState>>;
}) {
  return (
    <div className="grid gap-4">
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
    </div>
  );
}

function CreateAddressFields({
  formData,
  setFormData,
}: {
  formData: CreateFormState;
  setFormData: React.Dispatch<React.SetStateAction<CreateFormState>>;
}) {
  return (
    <div className="grid gap-4">
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
  const [namePhone, setNamePhone] = useState<NamePhoneState>({ name: "", phone: "" });
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Düzenleme modunda adres listesinin yerel kopyası — adres işlemleri
  // sunucudan tazelenince burada güncellenir, dialog kapanmaz.
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [defaultAddressId, setDefaultAddressId] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setNamePhone(fromCustomer(editing));
      setAddresses(editing.addresses);
      setDefaultAddressId(editing.defaultAddressId);
    } else {
      setCreateForm(EMPTY_FORM);
    }
    // editing sadece id ile değişirse yeniden senkronize et — dialog açıkken
    // adres işlemleri sonrası editing referansı değişmediği için formu ezmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const handleSubmit = async () => {
    if (isEdit && editing) {
      const error = validateNamePhone(namePhone);
      if (error) {
        toast.error(error);
        return;
      }
      setIsSaving(true);
      try {
        await updateCustomer(editing.id, {
          name: namePhone.name.trim(),
          phone: namePhone.phone.trim(),
        });
        toast.success("Müşteri güncellendi");
        onOpenChange(false);
        onSuccess();
      } catch {
        toast.error("Müşteri güncellenirken hata oluştu");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const error = validateCreate(createForm);
    if (error) {
      toast.error(error);
      return;
    }
    setIsSaving(true);
    try {
      await createCustomer({
        id: crypto.randomUUID(),
        name: createForm.name.trim(),
        phone: createForm.phone.trim(),
        address: createForm.address.trim(),
        addressDetail: createForm.addressDetail.trim() || undefined,
      });
      toast.success("Müşteri eklendi");
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Müşteri eklenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[85vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? "Müşteri Düzenle" : "Yeni Müşteri Ekle"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <NamePhoneFields formData={namePhone} setFormData={setNamePhone} />
          {isEdit && editing ? (
            <CustomerAddressSection
              customerId={editing.id}
              addresses={addresses}
              defaultAddressId={defaultAddressId}
              onAddressesChange={(next, nextDefault) => {
                setAddresses(next);
                setDefaultAddressId(nextDefault);
              }}
              onSynced={onSuccess}
            />
          ) : (
            <CreateAddressFields formData={createForm} setFormData={setCreateForm} />
          )}
        </div>
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
