"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { type OrderStep } from "@/types";

const steps: { key: OrderStep; label: string; emoji: string }[] = [
  { key: "products", label: "Ürünler", emoji: "🛒" },
  { key: "customer", label: "Müşteri", emoji: "👤" },
  { key: "payment", label: "Ödeme", emoji: "💳" },
  { key: "summary", label: "Özet & Fiş", emoji: "🧾" },
];

const stepIndex: Record<OrderStep, number> = {
  products: 0,
  customer: 1,
  payment: 2,
  summary: 3,
};

interface StepIndicatorProps {
  currentStep: OrderStep;
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = stepIndex[currentStep];

  return (
    <div className="flex items-center justify-center gap-0 w-full">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;

        return (
          <div key={step.key} className="flex items-center">
            {/* Adım dairesi */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300",
                  isCompleted && "border-primary bg-primary text-primary-foreground",
                  isActive &&
                    "border-primary bg-primary text-primary-foreground shadow-md scale-110",
                  !isCompleted &&
                    !isActive &&
                    "border-muted-foreground/30 bg-background text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : <span>{step.emoji}</span>}
              </div>
              <span
                className={cn(
                  "mt-1.5 text-xs font-medium whitespace-nowrap",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Bağlantı çizgisi */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "mb-5 h-0.5 w-16 sm:w-24 transition-all duration-300",
                  index < currentIndex ? "bg-primary" : "bg-muted-foreground/20",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
