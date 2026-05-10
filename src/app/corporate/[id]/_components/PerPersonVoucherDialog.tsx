import { memo, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { type Corporate, type Voucher } from "@/types";
import { createVoucher, updateVoucher } from "@/actions/vouchers";
import { formatCurrency } from "@/lib/utils";
import { toDateInputValue } from "@/lib/period";

interface PerPersonInitial {
  personCount: number;
  pricePerPerson: number;
  note?: string;
}

function PerPersonForm({
  corporate,
  date,
  setDate,
  isSaving,
  onSubmit,
  onCancel,
  initial,
  submitLabel,
}: {
  corporate: Corporate;
  date: string;
  setDate: (v: string) => void;
  isSaving: boolean;
  onSubmit: (data: { personCount: number; pricePerPerson: number; note?: string }) => void;
  onCancel: () => void;
  initial?: PerPersonInitial;
  submitLabel?: string;
}) {
  const [personCount, setPersonCount] = useState(
    initial ? String(initial.personCount) : "",
  );
  const [pricePerPerson, setPricePerPerson] = useState(
    String(initial?.pricePerPerson ?? corporate.pricePerPerson ?? ""),
  );
  const [note, setNote] = useState(initial?.note ?? "");

  const personNum = Number(personCount);
  const priceNum = Number(pricePerPerson);
  const total =
    Number.isFinite(personNum) && Number.isFinite(priceNum) && personNum > 0 && priceNum >= 0
      ? Math.round(personNum * priceNum * 100) / 100
      : 0;

  return (
    <>
      <div className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="date">Tarih *</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="personCount">Kişi Sayısı *</Label>
            <Input
              id="personCount"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="5"
              value={personCount}
              onChange={(e) => setPersonCount(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pricePerPerson">Kişi Başı Ücret (₺)</Label>
          <Input
            id="pricePerPerson"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={pricePerPerson}
            onChange={(e) => setPricePerPerson(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {corporate.pricePerPerson
              ? `Varsayılan: ${formatCurrency(corporate.pricePerPerson)} (kurumdan geliyor)`
              : "Bu kurumda varsayılan tanımlı değil"}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="note">Not</Label>
          <Textarea
            id="note"
            rows={2}
            placeholder="Öğle yemeği, fazladan içecek, vb. (isteğe bağlı)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
          <span className="text-sm text-muted-foreground">Toplam</span>
          <span className="text-lg font-bold tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          İptal
        </Button>
        <Button
          disabled={isSaving}
          onClick={() => {
            if (!Number.isFinite(personNum) || personNum < 1) {
              toast.error("Geçerli bir kişi sayısı girin");
              return;
            }
            if (!Number.isFinite(priceNum) || priceNum < 0) {
              toast.error("Geçerli bir kişi başı ücret girin");
              return;
            }
            onSubmit({
              personCount: personNum,
              pricePerPerson: priceNum,
              note: note.trim() || undefined,
            });
          }}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel ?? "Fiş Oluştur"}
        </Button>
      </DialogFooter>
    </>
  );
}

export const PerPersonVoucherDialog = memo(function PerPersonVoucherDialog({
  corporate,
  open,
  onOpenChange,
  onSuccess,
  editing,
}: {
  corporate: Corporate;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
  editing?: Voucher | null;
}) {
  const isEdit = !!editing;
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(toDateInputValue(editing ? new Date(editing.date) : new Date()));
  }, [open, editing]);

  const handleSubmit = async (data: {
    personCount: number;
    pricePerPerson: number;
    note?: string;
  }) => {
    setIsSaving(true);
    try {
      if (isEdit && editing) {
        const result = await updateVoucher(editing.id, {
          type: "per_person",
          corporateId: corporate.id,
          date: new Date(date + "T12:00:00"),
          ...data,
        });
        if (!result.ok) {
          toast.error(result.error ?? "Fiş güncellenemedi");
          return;
        }
        toast.success(`Fiş #${editing.voucherNumber} güncellendi`);
      } else {
        const result = await createVoucher({
          type: "per_person",
          corporateId: corporate.id,
          date: new Date(date + "T12:00:00"),
          ...data,
        });
        if (!result.ok) {
          toast.error(result.error ?? "Fiş oluşturulamadı");
          return;
        }
        toast.success(`Fiş #${result.voucherNumber} oluşturuldu`);
      }
      onOpenChange(false);
      onSuccess();
    } finally {
      setIsSaving(false);
    }
  };

  const initial: PerPersonInitial | undefined = editing
    ? {
        personCount: editing.personCount ?? 0,
        pricePerPerson: editing.pricePerPerson ?? 0,
        note: editing.note,
      }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? `Fiş Düzenle #${editing?.voucherNumber} — ${corporate.name}`
              : `Yeni Fiş — ${corporate.name}`}
          </DialogTitle>
        </DialogHeader>
        <PerPersonForm
          key={editing?.id ?? "new"}
          corporate={corporate}
          date={date}
          setDate={setDate}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          initial={initial}
          submitLabel={isEdit ? "Kaydet" : "Fiş Oluştur"}
        />
      </DialogContent>
    </Dialog>
  );
});
