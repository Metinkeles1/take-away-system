"use client";

import { useEffect, useState } from "react";
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
import { cn, formatCurrency } from "@/lib/utils";
import { Banknote, CreditCard, Utensils, Landmark, Check } from "lucide-react";
import type { Order, PaymentMethod, MealCardBrand, PaymentInfo } from "@/types";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";

const METHODS: {
  value: PaymentMethod;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { value: "cash", label: "Nakit", icon: Banknote, color: "border-green-400 bg-green-50 text-green-700" },
  { value: "card", label: "Kart", icon: CreditCard, color: "border-blue-400 bg-blue-50 text-blue-700" },
  { value: "meal_card", label: "Yemek Kartı", icon: Utensils, color: "border-orange-400 bg-orange-50 text-orange-700" },
  { value: "iban", label: "IBAN", icon: Landmark, color: "border-purple-400 bg-purple-50 text-purple-700" },
];

const BRANDS: { value: MealCardBrand; label: string }[] = [
  { value: "multinet", label: "Multinet" },
  { value: "setcard", label: "Setcard" },
  { value: "pluxee", label: "Pluxee" },
  { value: "edenred", label: "Edenred" },
  { value: "tokenflex", label: "Tokenflex" },
  { value: "metropol", label: "Metropol" },
];

interface Props {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCollect: (payment: PaymentInfo, amount: number, note?: string) => Promise<void>;
}

export function CollectPaymentDialog({ order, open, onOpenChange, onCollect }: Props) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [brand, setBrand] = useState<MealCardBrand>("multinet");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  // Nota seçilen sipariş kalemlerinin index'leri — tutarı otomatik doldurmak için.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Kalan alacak = sipariş tutarı − şimdiye dek tahsil edilen.
  const remaining = order
    ? Math.max(0, order.total - (order.paidAmount ?? 0))
    : 0;
  const hasPartial = (order?.paidAmount ?? 0) > 0;

  // Dialog açılınca tutarı kalanın tamamına ön-doldur (en sık senaryo: tümünü al).
  useEffect(() => {
    if (open && order) {
      setAmount(String(remaining));
      setNote("");
      setPicked(new Set());
    }
    // remaining order'a bağlı; order/open değişince yenilensin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  const parsed = Number(amount.replace(",", "."));
  const validAmount = Number.isFinite(parsed) && parsed > 0 && parsed <= remaining + 0.001;
  const afterRemaining = Math.max(0, remaining - (validAmount ? parsed : 0));

  // Bir sipariş kalemini seç/bırak: nota ekler ve tutarı seçili kalemlerin
  // toplamına çeker (kalanı aşmayacak şekilde). Tam ürün-bazlı muhasebe değil —
  // sadece "ne için ödedi" notunu ve tutarı kolaylaştıran bir yardımcı.
  const items = order?.items ?? [];
  const toggleItem = (idx: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      // Seçili kalemlerden tutar + not türet.
      const chosen = [...next].sort((a, b) => a - b);
      const sum = chosen.reduce((s, i) => s + (items[i]?.totalPrice ?? 0), 0);
      const label = chosen
        .map((i) => `${items[i].quantity}x ${items[i].product.name}`)
        .join(", ");
      setAmount(String(Math.min(sum, remaining)));
      setNote(label);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!order || !validAmount) return;
    setSaving(true);
    try {
      const payment: PaymentInfo = {
        method,
        mealCardBrand: method === "meal_card" ? brand : undefined,
        ibanName: method === "iban" ? DEFAULT_IBAN_NAME : undefined,
        ibanNumber: method === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
      };
      await onCollect(payment, parsed, note);
      onOpenChange(false);
      setMethod("cash");
      setBrand("multinet");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tahsilat Al</DialogTitle>
          <DialogDescription>
            {order
              ? `#${order.orderNumber} · ${order.customer.name} · ${formatCurrency(order.total)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Tahsilat tutarı — varsayılan kalanın tamamı; azaltılırsa kısmi tahsilat */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Tahsil edilen tutar
              </p>
              <span className="text-xs text-muted-foreground">
                {hasPartial && (
                  <span className="text-amber-600">
                    Ödenen {formatCurrency(order?.paidAmount ?? 0)} ·{" "}
                  </span>
                )}
                Kalan {formatCurrency(remaining)}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={saving}
                className="text-base font-semibold tabular-nums"
                placeholder="0"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setAmount(String(remaining))}
                disabled={saving}
              >
                Tümü
              </Button>
            </div>
            {amount.length > 0 && !validAmount ? (
              <p className="text-xs text-red-600">
                0 ile {formatCurrency(remaining)} arasında bir tutar girin.
              </p>
            ) : validAmount && afterRemaining > 0.001 ? (
              <p className="text-xs text-amber-600">
                Kısmi tahsilat — bu ödeme sonrası kalan{" "}
                {formatCurrency(afterRemaining)} açık hesapta kalır.
              </p>
            ) : null}
          </div>

          {/* Ürüne göre doldur — kalemlere tıklayınca tutar+not otomatik dolar.
              Kısmi ödemede "ne için aldım" kaydı için pratik kısayol. */}
          {items.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Ürüne göre (opsiyonel)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((it, idx) => {
                  const active = picked.has(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleItem(idx)}
                      disabled={saving}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                        active
                          ? "border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                          : "border-border bg-background hover:bg-muted/50",
                        saving && "opacity-50",
                      )}
                    >
                      {it.quantity}x {it.product.name}
                      <span className="ml-1 opacity-70 tabular-nums">
                        {formatCurrency(it.totalPrice)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Not — çiplerden otomatik dolar, elle de düzenlenebilir */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Not (opsiyonel)</p>
            <Input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
              placeholder="örn. 2x Döner için"
              className="text-sm"
            />
          </div>

          <p className="text-xs font-medium text-muted-foreground">Ödeme yöntemi</p>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => {
              const Icon = m.icon;
              const active = method === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  disabled={saving}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                    active ? `${m.color} border-current shadow-sm` : "border-border bg-background hover:bg-muted/50",
                    saving && "opacity-50",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>

          {method === "meal_card" && (
            <div className="grid grid-cols-3 gap-1.5">
              {BRANDS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setBrand(b.value)}
                  disabled={saving}
                  className={cn(
                    "rounded-lg border-2 py-1.5 px-2 text-xs font-semibold transition-all",
                    brand === b.value
                      ? "border-orange-400 bg-orange-100 text-orange-800"
                      : "border-border bg-background hover:bg-muted/50",
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !validAmount}>
            <Check className="mr-1.5 h-4 w-4" />
            {saving
              ? "Kaydediliyor..."
              : validAmount && afterRemaining > 0.001
                ? `${formatCurrency(parsed)} Tahsil Et`
                : "Tahsil Edildi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
