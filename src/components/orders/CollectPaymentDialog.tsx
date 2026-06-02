"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  onCollect: (payment: PaymentInfo) => Promise<void>;
}

export function CollectPaymentDialog({ order, open, onOpenChange, onCollect }: Props) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [brand, setBrand] = useState<MealCardBrand>("multinet");
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const payment: PaymentInfo = {
        method,
        mealCardBrand: method === "meal_card" ? brand : undefined,
        ibanName: method === "iban" ? DEFAULT_IBAN_NAME : undefined,
        ibanNumber: method === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
      };
      await onCollect(payment);
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
          <Button onClick={handleConfirm} disabled={saving}>
            <Check className="mr-1.5 h-4 w-4" />
            {saving ? "Kaydediliyor..." : "Tahsil Edildi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
