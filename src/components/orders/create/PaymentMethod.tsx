"use client";

import { useState } from "react";

import { useOrderStore } from "@/store/orderStore";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CreditCard,
  Utensils,
  Landmark,
} from "lucide-react";
import { type PaymentMethod, type MealCardBrand } from "@/types";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";

const paymentMethods: {
  value: PaymentMethod;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    value: "cash",
    label: "Nakit",
    description: "Kapıda nakit ödeme",
    icon: Banknote,
    color: "border-green-300 bg-green-50 text-green-700",
  },
  {
    value: "card",
    label: "Kredi / Banka Kartı",
    description: "Kapıda POS cihazı ile",
    icon: CreditCard,
    color: "border-blue-300 bg-blue-50 text-blue-700",
  },
  {
    value: "meal_card",
    label: "Yemek Kartı",
    description: "Multinet, Setcard, Pluxee ve diğerleri",
    icon: Utensils,
    color: "border-orange-300 bg-orange-50 text-orange-700",
  },
  {
    value: "iban",
    label: "IBAN ile Ödeme",
    description: "Banka havalesi / EFT",
    icon: Landmark,
    color: "border-purple-300 bg-purple-50 text-purple-700",
  },
];

const mealCardBrands: { value: MealCardBrand; label: string }[] = [
  { value: "multinet", label: "Multinet" },
  { value: "setcard", label: "Setcard" },
  { value: "pluxee", label: "Pluxee" },
  { value: "edenred", label: "Edenred" },
  { value: "tokenflex", label: "Tokenflex" },
  { value: "metropol", label: "Metropol" },
];

export default function PaymentMethod() {
  const { draft, setPayment, setStep } = useOrderStore();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    (draft.payment.method as PaymentMethod) ?? "cash",
  );
  const [selectedBrand, setSelectedBrand] = useState<MealCardBrand>(
    (draft.payment.mealCardBrand as MealCardBrand) ?? "multinet",
  );

  const handleMethodChange = (method: PaymentMethod) => {
    setSelectedMethod(method);
  };

  const handleNext = () => {
    setPayment({
      method: selectedMethod,
      mealCardBrand: selectedMethod === "meal_card" ? selectedBrand : undefined,
      ibanName: selectedMethod === "iban" ? DEFAULT_IBAN_NAME : undefined,
      ibanNumber: selectedMethod === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
    });
    setStep("summary");
  };

  return (
    <div className="h-full flex flex-col items-center overflow-hidden">
      <div className="w-full max-w-2xl flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CreditCard className="h-5 w-5 text-primary" />
              Ödeme Yöntemi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Yöntem seçimi */}
            <div className="space-y-3">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = selectedMethod === method.value;
                return (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => handleMethodChange(method.value)}
                    className={cn(
                      "flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-all",
                      isSelected
                        ? method.color + " border-current shadow-sm scale-[1.01]"
                        : "border-border bg-background hover:bg-muted/50",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-lg p-2",
                        isSelected ? "bg-white/60" : "bg-muted",
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{method.label}</p>
                      <p className="text-sm opacity-70">{method.description}</p>
                    </div>
                    <div
                      className={cn(
                        "h-5 w-5 rounded-full border-2 transition-all",
                        isSelected
                          ? "border-current bg-current"
                          : "border-muted-foreground",
                      )}
                    />
                  </button>
                );
              })}
            </div>

            {/* Yemek Kartı Marka Seçimi */}
            {selectedMethod === "meal_card" && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Yemek Kartı Markası
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {mealCardBrands.map((brand) => (
                    <button
                      key={brand.value}
                      type="button"
                      onClick={() => setSelectedBrand(brand.value)}
                      className={cn(
                        "rounded-lg border-2 py-2 px-3 text-sm font-semibold transition-all",
                        selectedBrand === brand.value
                          ? "border-orange-400 bg-orange-100 text-orange-800 shadow-sm scale-[1.03]"
                          : "border-border bg-background hover:bg-muted/50 text-foreground",
                      )}
                    >
                      {brand.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Butonlar */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("customer")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Geri
              </Button>
              <Button className="flex-1" onClick={handleNext}>
                Özeti Gör
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
