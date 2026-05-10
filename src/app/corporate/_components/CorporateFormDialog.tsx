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
import { type BillingType, type Corporate } from "@/types";
import { createCorporate, updateCorporate } from "@/actions/corporate";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CorporateFormState {
  name: string;
  phone: string;
  address: string;
  billingType: BillingType;
  pricePerPerson: string;
}

const EMPTY_FORM: CorporateFormState = {
  name: "",
  phone: "",
  address: "",
  billingType: "per_person",
  pricePerPerson: "",
};

function fromCorporate(c: Corporate): CorporateFormState {
  return {
    name: c.name,
    phone: c.phone ?? "",
    address: c.address ?? "",
    billingType: c.billingType,
    pricePerPerson: c.pricePerPerson != null ? String(c.pricePerPerson) : "",
  };
}

function validate(form: CorporateFormState): string | null {
  if (!form.name.trim()) return "İşletme adı zorunludur";
  if (form.billingType === "per_person") {
    const price = Number(form.pricePerPerson);
    if (!form.pricePerPerson.trim() || Number.isNaN(price) || price <= 0) {
      return "Geçerli bir kişi başı ücret girin";
    }
  }
  return null;
}

function toPayload(form: CorporateFormState) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim() || undefined,
    address: form.address.trim() || undefined,
    billingType: form.billingType,
    pricePerPerson:
      form.billingType === "per_person" ? Number(form.pricePerPerson) : undefined,
  };
}

function CorporateFormFields({
  formData,
  setFormData,
}: {
  formData: CorporateFormState;
  setFormData: React.Dispatch<React.SetStateAction<CorporateFormState>>;
}) {
  const isPerPerson = formData.billingType === "per_person";

  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="name">İşletme Adı *</Label>
        <Input
          id="name"
          placeholder="Örn. Teknik İstif"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <Label>Faturalama Tipi *</Label>
        <div className="grid grid-cols-2 gap-1 rounded-md border p-1">
          {(["per_person", "per_item"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFormData((p) => ({ ...p, billingType: t }))}
              className={cn(
                "h-8 rounded text-xs font-medium transition-colors",
                formData.billingType === t
                  ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t === "per_person" ? "Kişi başı" : "Ürün başı"}
            </button>
          ))}
        </div>
      </div>

      {isPerPerson && (
        <div className="grid gap-2">
          <Label htmlFor="pricePerPerson">Kişi Başı Ücret (₺) *</Label>
          <Input
            id="pricePerPerson"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="150"
            value={formData.pricePerPerson}
            onChange={(e) =>
              setFormData((p) => ({ ...p, pricePerPerson: e.target.value }))
            }
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="phone">Telefon</Label>
        <Input
          id="phone"
          placeholder="05XX XXX XX XX (isteğe bağlı)"
          value={formData.phone}
          onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="address">Adres</Label>
        <Input
          id="address"
          placeholder="İşletme adresi (isteğe bağlı)"
          value={formData.address}
          onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
        />
      </div>
    </div>
  );
}

interface CorporateFormDialogProps {
  /** null/undefined = ekleme modu, Corporate = düzenleme modu */
  editing?: Corporate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CorporateFormDialog = memo(function CorporateFormDialog({
  editing,
  open,
  onOpenChange,
  onSuccess,
}: CorporateFormDialogProps) {
  const isEdit = !!editing;
  const [formData, setFormData] = useState<CorporateFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormData(editing ? fromCorporate(editing) : EMPTY_FORM);
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
        await updateCorporate(editing.id, toPayload(formData));
        toast.success("Güncellendi");
      } else {
        await createCorporate({ id: crypto.randomUUID(), ...toPayload(formData) });
        toast.success("Kurumsal müşteri eklendi");
      }
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error(isEdit ? "Güncellenirken hata oluştu" : "Eklenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Kurumsal Müşteri Düzenle" : "Yeni Kurumsal Müşteri"}
          </DialogTitle>
        </DialogHeader>
        <CorporateFormFields formData={formData} setFormData={setFormData} />
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
