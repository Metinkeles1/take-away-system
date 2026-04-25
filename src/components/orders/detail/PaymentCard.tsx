"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Banknote,
  CreditCard,
  Utensils,
  Landmark,
  Pencil,
  X,
  Check,
} from "lucide-react";
import type {
  Order,
  PaymentMethod,
  MealCardBrand,
} from "@/types";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";
import { memo, useState, useCallback } from "react";
import { toast } from "sonner";

interface Props {
  payment: Order["payment"];
  onPaymentUpdate: (newPayment: {
    method: PaymentMethod;
    mealCardBrand?: MealCardBrand;
    ibanName?: string;
    ibanNumber?: string;
  }) => Promise<void>;
}

const paymentLabels: Record<string, string> = {
  cash: "💵 Nakit",
  card: "💳 Kredi / Banka Kartı",
  meal_card: "🍴 Yemek Kartı",
  iban: "🏦 IBAN / Havale",
};

const mealCardLabels: Record<string, string> = {
  multinet: "Multinet",
  setcard: "Setcard",
  pluxee: "Pluxee",
  edenred: "Edenred",
  tokenflex: "Tokenflex",
  metropol: "Metropol",
};

const paymentMethodOptions: {
  value: PaymentMethod;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    value: "cash",
    label: "Nakit",
    icon: Banknote,
    color: "border-green-300 bg-green-50 text-green-700",
  },
  {
    value: "card",
    label: "Kredi / Banka Kartı",
    icon: CreditCard,
    color: "border-blue-300 bg-blue-50 text-blue-700",
  },
  {
    value: "meal_card",
    label: "Yemek Kartı",
    icon: Utensils,
    color: "border-orange-300 bg-orange-50 text-orange-700",
  },
  {
    value: "iban",
    label: "IBAN / Havale",
    icon: Landmark,
    color: "border-purple-300 bg-purple-50 text-purple-700",
  },
];

const mealCardBrandOptions: { value: MealCardBrand; label: string }[] = [
  { value: "multinet", label: "Multinet" },
  { value: "setcard", label: "Setcard" },
  { value: "pluxee", label: "Pluxee" },
  { value: "edenred", label: "Edenred" },
  { value: "tokenflex", label: "Tokenflex" },
  { value: "metropol", label: "Metropol" },
];

const PaymentCard = memo(function PaymentCard({
  payment,
  onPaymentUpdate,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editMethod, setEditMethod] = useState<PaymentMethod>(payment.method);
  const [editBrand, setEditBrand] = useState<MealCardBrand>(
    payment.mealCardBrand ?? "multinet"
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const newPayment = {
        method: editMethod,
        mealCardBrand: editMethod === "meal_card" ? editBrand : undefined,
        ibanName: editMethod === "iban" ? DEFAULT_IBAN_NAME : undefined,
        ibanNumber: editMethod === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
      };
      await onPaymentUpdate(newPayment);
      setIsEditing(false);
      toast.success("Ödeme yöntemi güncellendi");
    } finally {
      setIsSaving(false);
    }
  }, [editMethod, editBrand, onPaymentUpdate]);

  const handleCancel = useCallback(() => {
    setEditMethod(payment.method);
    setEditBrand(payment.mealCardBrand ?? "multinet");
    setIsEditing(false);
  }, [payment]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Ödeme</CardTitle>
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Düzenle
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        {isEditing ? (
          <div className="space-y-4">
            {/* Yöntem seçimi */}
            <div className="grid grid-cols-2 gap-2">
              {paymentMethodOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = editMethod === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditMethod(opt.value)}
                    disabled={isSaving}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all text-sm",
                      isSelected
                        ? opt.color + " border-current shadow-sm"
                        : "border-border bg-background hover:bg-muted/50",
                      isSaving && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="font-medium leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Yemek kartı marka seçimi */}
            {editMethod === "meal_card" && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Kart Markası
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {mealCardBrandOptions.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => setEditBrand(b.value)}
                      disabled={isSaving}
                      className={cn(
                        "rounded-lg border-2 py-2 px-3 text-xs font-semibold transition-all",
                        editBrand === b.value
                          ? "border-orange-400 bg-orange-100 text-orange-800 shadow-sm"
                          : "border-border bg-background hover:bg-muted/50",
                        isSaving && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Kaydet / İptal */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleCancel}
                disabled={isSaving}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                İptal
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleSave}
                disabled={isSaving}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {isSaving ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Yöntem</span>
              <span className="font-medium">
                {paymentLabels[payment.method] ?? payment.method}
              </span>
            </div>
            {payment.method === "meal_card" && payment.mealCardBrand && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Marka</span>
                <span className="font-medium">
                  {mealCardLabels[payment.mealCardBrand] ??
                    payment.mealCardBrand}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default PaymentCard;
