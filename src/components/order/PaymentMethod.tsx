"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOrderStore, selectTotal } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn, formatCurrency } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Banknote, CreditCard, Smartphone } from "lucide-react";
import { type PaymentMethod, type PaymentFormData } from "@/types";

const paymentSchema = z
  .object({
    method: z.enum(["cash", "card", "online"]),
    cashGiven: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.method === "cash" && data.cashGiven) {
        const num = parseFloat(data.cashGiven);
        return !isNaN(num) && num >= 0;
      }
      return true;
    },
    { message: "Geçerli bir tutar girin", path: ["cashGiven"] },
  );

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
    value: "online",
    label: "Online Ödeme",
    description: "Önceden ödendi",
    icon: Smartphone,
    color: "border-purple-300 bg-purple-50 text-purple-700",
  },
];

export default function PaymentMethod() {
  const { draft, setPayment, setStep } = useOrderStore();
  const total = useOrderStore(selectTotal);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    (draft.payment.method as PaymentMethod) ?? "cash",
  );
  const [cashGiven, setCashGiven] = useState(draft.payment.cashGiven?.toString() ?? "");

  const cashGivenNum = parseFloat(cashGiven) || 0;
  const change =
    selectedMethod === "cash" && cashGivenNum > 0 ? Math.max(0, cashGivenNum - total) : 0;
  const isInsufficient =
    selectedMethod === "cash" && cashGivenNum > 0 && cashGivenNum < total;

  const handleNext = () => {
    setPayment({
      method: selectedMethod,
      cashGiven: selectedMethod === "cash" ? cashGivenNum : undefined,
      change: selectedMethod === "cash" ? change : undefined,
    });
    setStep("summary");
  };

  const canProceed =
    selectedMethod !== "cash" || cashGiven === "" || cashGivenNum >= total;

  return (
    <div className="mx-auto max-w-2xl">
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
                  onClick={() => setSelectedMethod(method.value)}
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

          {/* Nakit: Para üstü hesabı */}
          {selectedMethod === "cash" && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cashGiven">Müşterinin Vereceği Tutar (opsiyonel)</Label>
                  <div className="relative">
                    <Input
                      id="cashGiven"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={`Min. ${formatCurrency(total)}`}
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                      className={cn("pr-8", isInsufficient && "border-destructive")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ₺
                    </span>
                  </div>
                  {isInsufficient && (
                    <p className="text-xs text-destructive">
                      Verilen tutar toplam tutardan ({formatCurrency(total)}) az olamaz
                    </p>
                  )}
                </div>

                {/* Para üstü göster */}
                {cashGivenNum > 0 && !isInsufficient && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Toplam Tutar</span>
                      <span className="font-medium">{formatCurrency(total)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-muted-foreground">Verilen</span>
                      <span className="font-medium">{formatCurrency(cashGivenNum)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-green-700">Para Üstü</span>
                      <span className="text-xl font-bold text-green-700">
                        {formatCurrency(change)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
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
            <Button className="flex-1" disabled={!canProceed} onClick={handleNext}>
              Özeti Gör
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
