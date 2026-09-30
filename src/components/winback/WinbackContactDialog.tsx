"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Phone, ThumbsDown, ThumbsUp, PhoneOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/dashboard/komuta/KomutaUI";
import { recordWinbackContact, deleteWinbackContact } from "@/actions/winback";
import {
  fillWinbackTemplate,
  type WinbackCallResult,
  type WinbackMethod,
  type WinbackRow,
  type WinbackTemplate,
} from "@/lib/winback";
import { cn, formatPhone, phoneKey, toLocalPhone, toWhatsAppPhone } from "@/lib/utils";

const CALL_RESULTS: {
  id: WinbackCallResult;
  label: string;
  hint: string;
  icon: React.ElementType;
  className: string;
}[] = [
  {
    id: "positive",
    label: "Konuştuk",
    hint: "Ulaşıldı — dönmesi beklenir",
    icon: ThumbsUp,
    className: "data-[on=true]:border-emerald-400 data-[on=true]:bg-emerald-50 data-[on=true]:text-emerald-800 dark:data-[on=true]:bg-emerald-950/40 dark:data-[on=true]:text-emerald-200",
  },
  {
    id: "no_answer",
    label: "Açmadı",
    hint: "Listede kalır, sonra tekrar denenir",
    icon: PhoneOff,
    className: "data-[on=true]:border-amber-400 data-[on=true]:bg-amber-50 data-[on=true]:text-amber-800 dark:data-[on=true]:bg-amber-950/40 dark:data-[on=true]:text-amber-200",
  },
  {
    id: "negative",
    label: "İstemiyor",
    hint: "Bir daha listelenmez",
    icon: ThumbsDown,
    className: "data-[on=true]:border-rose-400 data-[on=true]:bg-rose-50 data-[on=true]:text-rose-800 dark:data-[on=true]:bg-rose-950/40 dark:data-[on=true]:text-rose-200",
  },
];

// Müşteriye ulaşma penceresi. WhatsApp: şablon seç → mesaj hazır dolar →
// düzenlenebilir → "WhatsApp'ta aç" hem sohbeti açar hem ulaşmayı kaydeder.
// Telefon: ara → sonucu ve notu kaydet.
export function WinbackContactDialog({
  row,
  initialMethod,
  templates,
  onClose,
  onSaved,
}: {
  row: WinbackRow | null;
  initialMethod: WinbackMethod;
  templates: WinbackTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      {row && (
        <ContactForm
          key={row.key}
          row={row}
          initialMethod={initialMethod}
          templates={templates}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function ContactForm({
  row,
  initialMethod,
  templates,
  onClose,
  onSaved,
}: {
  row: WinbackRow;
  initialMethod: WinbackMethod;
  templates: WinbackTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [method, setMethod] = useState<WinbackMethod>(initialMethod);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [message, setMessage] = useState(() =>
    templates[0] ? fillWinbackTemplate(templates[0].text, row) : "",
  );
  const [result, setResult] = useState<WinbackCallResult | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const template = templates.find((t) => t.id === templateId);
  const title = row.name ?? formatPhone(phoneKey(row.phone));

  const pickTemplate = (t: WinbackTemplate) => {
    setTemplateId(t.id);
    setMessage(fillWinbackTemplate(t.text, row));
  };

  const save = async (input: Parameters<typeof recordWinbackContact>[0]) => {
    setSaving(true);
    try {
      const res = await recordWinbackContact(input);
      if (!res.ok || !res.contactId) {
        toast.error(res.error ?? "Kaydedilemedi");
        return;
      }
      const contactId = res.contactId;
      toast.success(
        input.result === "no_answer"
          ? "Kaydedildi — müşteri listede kalıyor"
          : input.result === "negative"
            ? "Kaydedildi — müşteri hariç tutuldu"
            : "Kaydedildi — 'Ulaşıldı' sekmesine taşındı",
        {
          action: {
            label: "Geri al",
            onClick: async () => {
              await deleteWinbackContact(row.phone, contactId);
              onSaved();
            },
          },
          // Varsayılan 4 sn "Geri al"ı fark etmeye yetmiyor.
          duration: 10_000,
        },
      );
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const openWhatsApp = () => {
    const text = message.trim();
    if (!text) {
      toast.error("Mesaj boş olamaz");
      return;
    }
    // Pencereyi await'ten ÖNCE aç — aksi halde tarayıcı açılır pencereyi engeller.
    window.open(
      `https://wa.me/${toWhatsAppPhone(row.phone)}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
    void save({
      phone: row.phone,
      method: "whatsapp",
      templateTitle: template?.title,
      message: text,
    });
  };

  const saveCall = () => {
    if (!result) {
      toast.error("Görüşmenin sonucunu seçin");
      return;
    }
    void save({ phone: row.phone, method: "call", result, note });
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {row.orders} sipariş · son sipariş {row.daysSince} gün önce
          {row.favorites[0] ? ` · en çok ${row.favorites[0]}` : ""}
        </DialogDescription>
      </DialogHeader>

      <Segmented
        ariaLabel="Ulaşma yolu"
        value={method}
        onChange={setMethod}
        options={[
          { id: "whatsapp", label: "WhatsApp mesajı", icon: MessageCircle },
          { id: "call", label: "Telefonla arama", icon: Phone },
        ]}
        className="w-full *:flex-1 *:justify-center"
      />

      {method === "whatsapp" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  t.id === templateId
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.title}
              </button>
            ))}
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="resize-none text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Mesajı gönderilmeden önce buradan düzenleyebilirsiniz. WhatsApp açılınca yalnızca
            &quot;Gönder&quot;e basın.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="outline" size="lg" asChild>
            <a href={`tel:${toLocalPhone(row.phone)}`}>
              <Phone />
              {formatPhone(phoneKey(row.phone))} — Ara
            </a>
          </Button>
          <div className="grid grid-cols-3 gap-2">
            {CALL_RESULTS.map((r) => (
              <button
                key={r.id}
                type="button"
                data-on={result === r.id}
                onClick={() => setResult(r.id)}
                title={r.hint}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted",
                  r.className,
                )}
              >
                <r.icon className="size-4" />
                {r.label}
              </button>
            ))}
          </div>
          {result && (
            <p className="text-xs text-muted-foreground">
              {CALL_RESULTS.find((r) => r.id === result)?.hint}
            </p>
          )}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Not (ör. %10 indirim sözü verildi, yemek soğuk gelmiş dedi…)"
            className="resize-none text-sm"
          />
        </div>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Vazgeç
        </Button>
        {method === "whatsapp" ? (
          <Button
            onClick={openWhatsApp}
            disabled={saving}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <MessageCircle />
            WhatsApp&apos;ta aç ve kaydet
          </Button>
        ) : (
          <Button onClick={saveCall} disabled={saving}>
            Kaydet
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
