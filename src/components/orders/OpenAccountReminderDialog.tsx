"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, MessageSquare } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { getShopIban, type ShopIban } from "@/actions/settings";
import { cn, formatCurrency, toLocalPhone, toWhatsAppPhone } from "@/lib/utils";
import type { Order } from "@/types";

export type ReminderTarget = {
  customer: { name: string; phone: string };
  orders: Order[];
  // Verilirse sadece bu siparişler seçili açılır (tek sipariş için mesaj).
  // Verilmezse hepsi seçili gelir (toplu bilgilendirme).
  selectedIds?: string[];
};

const remainingOf = (o: Order) => Math.max(0, o.total - (o.paidAmount ?? 0));

function shortDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
}

// Bir siparişin ürün satırları: "2× Lahmacun (0.5 Porsiyon, Acısız) — 180 ₺".
function itemLines(o: Order): string[] {
  const lines = (o.items ?? []).map((it) => {
    const extras = [
      it.portion && it.portion.size !== "full" ? it.portion.label : null,
      ...(it.options ?? []),
    ].filter(Boolean);
    const name = it.product?.name ?? "Ürün";
    return `   ${it.quantity}× ${name}${extras.length ? ` (${extras.join(", ")})` : ""} — ${formatCurrency(it.totalPrice)}`;
  });
  if (o.discount?.amount) lines.push(`   İndirim — -${formatCurrency(o.discount.amount)}`);
  if (o.deliveryFee) lines.push(`   Teslimat — ${formatCurrency(o.deliveryFee)}`);
  const paid = o.paidAmount ?? 0;
  if (paid > 0) lines.push(`   Ödenen — -${formatCurrency(paid)}`);
  return lines;
}

// Açık hesap bilgilendirme metni: seçili siparişlerin dökümü (tarih + kalan,
// istenirse ürünleriyle), toplam ve varsa dükkanın IBAN'ı.
function buildMessage(
  name: string,
  orders: Order[],
  withItems: boolean,
  iban: ShopIban | null,
): string {
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const total = orders.reduce((sum, o) => sum + remainingOf(o), 0);
  const lines = [
    `Merhaba${firstName ? ` ${firstName}` : ""},`,
    "",
    orders.length === 1
      ? "Açık hesabınızda ödemesi bekleyen bir sipariş bulunuyor:"
      : `Açık hesabınızda ödemesi bekleyen ${orders.length} sipariş bulunuyor:`,
  ];
  for (const o of orders) {
    if (withItems && orders.length > 1) lines.push("");
    lines.push(`• ${shortDate(o.createdAt)} — #${o.orderNumber} — ${formatCurrency(remainingOf(o))}`);
    if (withItems) lines.push(...itemLines(o));
  }
  if (orders.length > 1 || withItems) lines.push("", `Toplam: ${formatCurrency(total)}`);
  if (iban) {
    lines.push(
      "",
      "Ödemeyi aşağıdaki IBAN'a yapabilirsiniz:",
      iban.name,
      iban.iban.replace(/(.{4})/g, "$1 ").trim(),
    );
  }
  lines.push("", "Teşekkür ederiz.");
  return lines.join("\n");
}

// IBAN tek sefer çekilir, sayfa boyunca tekrar kullanılır.
let ibanCache: Promise<ShopIban | null> | null = null;

export function OpenAccountReminderDialog({
  target,
  onClose,
}: {
  target: ReminderTarget | null;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [withItems, setWithItems] = useState(false);
  const [iban, setIban] = useState<ShopIban | null>(null);

  // Dialog açılınca seçimleri sıfırla, IBAN'ı (bir kez) çek.
  useEffect(() => {
    if (!target) return;
    let alive = true;
    setSelected(new Set(target.selectedIds ?? target.orders.map((o) => o.id)));
    setWithItems(!!target.selectedIds && target.selectedIds.length === 1);
    ibanCache ??= getShopIban().catch(() => null);
    void ibanCache.then((v) => {
      if (alive) setIban(v);
    });
    return () => {
      alive = false;
    };
  }, [target]);

  const chosen = useMemo(
    () => (target ? target.orders.filter((o) => selected.has(o.id)) : []),
    [target, selected],
  );
  const chosenTotal = chosen.reduce((sum, o) => sum + remainingOf(o), 0);

  // Seçim / ürün detayı / IBAN değişince metin yeniden oluşur.
  useEffect(() => {
    if (!target) return;
    setMessage(chosen.length ? buildMessage(target.customer.name, chosen, withItems, iban) : "");
  }, [target, chosen, withItems, iban]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = !!target && selected.size === target.orders.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(target?.orders.map((o) => o.id)));

  if (!target) return null;
  const phone = target.customer.phone;

  const openWhatsApp = () => {
    window.open(
      `https://wa.me/${toWhatsAppPhone(phone)}?text=${encodeURIComponent(message)}`,
      "_blank",
    );
    onClose();
  };

  const openSms = () => {
    window.location.href = `sms:${toLocalPhone(phone)}?body=${encodeURIComponent(message)}`;
    onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mesaj kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Açık hesap bilgilendirmesi</DialogTitle>
          <DialogDescription>
            {target.customer.name} · {phone || "telefon yok"}
          </DialogDescription>
        </DialogHeader>

        {/* Hangi siparişler mesaja girsin — tek tek veya hepsi. */}
        {target.orders.length > 1 && (
          <div className="rounded-lg border">
            <label className="flex cursor-pointer items-center gap-2.5 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              <span className="flex-1">Tüm siparişler ({target.orders.length})</span>
              <span className="tabular-nums">{formatCurrency(chosenTotal)}</span>
            </label>
            <div className="max-h-40 divide-y overflow-y-auto">
              {target.orders.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/30"
                >
                  <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} />
                  <span className="font-medium">#{o.orderNumber}</span>
                  <span className="flex-1 text-xs text-muted-foreground">{shortDate(o.createdAt)}</span>
                  <span className="tabular-nums">{formatCurrency(remainingOf(o))}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox checked={withItems} onCheckedChange={(v) => setWithItems(v === true)} />
          Sipariş içeriğini (ürünleri) ekle
        </label>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={10}
          placeholder="En az bir sipariş seçin"
          className={cn("resize-none text-sm", !chosen.length && "opacity-60")}
        />
        <p className="text-xs text-muted-foreground">
          Metni elle düzenleyebilirsiniz; seçimi değiştirirseniz metin yeniden oluşur. IBAN,
          Ayarlar&apos;da girildiyse otomatik eklenir.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={copy} disabled={!message.trim()}>
            <Copy />
            Kopyala
          </Button>
          <Button variant="outline" onClick={openSms} disabled={!phone || !message.trim()}>
            <MessageSquare />
            SMS
          </Button>
          <Button
            onClick={openWhatsApp}
            disabled={!phone || !message.trim()}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <MessageCircle />
            WhatsApp&apos;ta aç
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
