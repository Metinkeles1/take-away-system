"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveWinbackSettings } from "@/actions/winback";
import type { WinbackSettings } from "@/lib/winback";

const NUMBER_FIELDS: {
  key: "minOrders" | "lapsedDays" | "maxDays" | "waitDays";
  label: string;
  hint: string;
}[] = [
  { key: "minOrders", label: "Sadık müşteri", hint: "En az bu kadar sipariş vermiş olan" },
  { key: "lapsedDays", label: "Kaybolan sayılır (gün)", hint: "Bu kadar gündür sipariş yoksa" },
  { key: "maxDays", label: "En fazla (gün)", hint: "Bundan eskiler listelenmez" },
  { key: "waitDays", label: "Dönüşü bekle (gün)", hint: "Ulaştıktan sonra bu süre içinde dönerse kazanıldı sayılır" },
];

export function WinbackSettingsDialog({
  open,
  settings,
  onClose,
  onSaved,
}: {
  open: boolean;
  settings: WinbackSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && <SettingsForm settings={settings} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function SettingsForm({
  settings,
  onClose,
  onSaved,
}: {
  settings: WinbackSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<WinbackSettings>(settings);
  const [saving, setSaving] = useState(false);

  const updateTemplate = (id: string, patch: { title?: string; text?: string }) =>
    setDraft((d) => ({
      ...d,
      templates: d.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveWinbackSettings(draft);
      if (!res.ok) {
        toast.error(res.error ?? "Kaydedilemedi");
        return;
      }
      toast.success("Ayarlar kaydedildi");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Geri Kazan ayarları</DialogTitle>
        <DialogDescription>
          Kimin listeye gireceğini ve gönderilecek hazır mesajları buradan belirleyin.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUMBER_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <Label htmlFor={`wb-${f.key}`} className="text-xs">
              {f.label}
            </Label>
            <Input
              id={`wb-${f.key}`}
              type="number"
              inputMode="numeric"
              min={1}
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) }))}
            />
            <span className="text-xs leading-snug text-muted-foreground">{f.hint}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">Mesaj şablonları</h3>
          <p className="text-xs text-muted-foreground">
            Mesajda <code className="rounded bg-muted px-1">{"{ad}"}</code> müşterinin adı,{" "}
            <code className="rounded bg-muted px-1">{"{urun}"}</code> en çok aldığı ürün,{" "}
            <code className="rounded bg-muted px-1">{"{gun}"}</code> kaç gündür gelmediği ile
            otomatik dolar.
          </p>
        </div>
        {draft.templates.map((t) => (
          <div key={t.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Input
                value={t.title}
                onChange={(e) => updateTemplate(t.id, { title: e.target.value })}
                placeholder="Şablon adı"
                className="h-8 font-medium"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Şablonu sil"
                disabled={draft.templates.length <= 1}
                onClick={() =>
                  setDraft((d) => ({ ...d, templates: d.templates.filter((x) => x.id !== t.id) }))
                }
              >
                <Trash2 className="text-muted-foreground" />
              </Button>
            </div>
            <Textarea
              value={t.text}
              onChange={(e) => updateTemplate(t.id, { text: e.target.value })}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        ))}
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              templates: [
                ...d.templates,
                { id: `t-${Date.now().toString(36)}`, title: "Yeni şablon", text: "Merhaba {ad}, " },
              ],
            }))
          }
        >
          <Plus />
          Şablon ekle
        </Button>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Vazgeç
        </Button>
        <Button onClick={save} disabled={saving}>
          Kaydet
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
