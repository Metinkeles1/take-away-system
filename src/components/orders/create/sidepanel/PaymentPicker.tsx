import { cn } from "@/lib/utils";
import { type PaymentMethod, type MealCardBrand } from "@/types";
import {
  CreditCard,
  Banknote,
  Utensils,
  Landmark,
} from "lucide-react";
import { SectionTitle } from "./SectionTitle";

const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  icon: React.ElementType;
  activeClass: string;
}[] = [
  {
    value: "cash",
    label: "Nakit",
    icon: Banknote,
    activeClass: "bg-emerald-50 ring-emerald-500 text-emerald-700 dark:bg-emerald-950",
  },
  {
    value: "card",
    label: "Kart",
    icon: CreditCard,
    activeClass: "bg-blue-50 ring-blue-500 text-blue-700 dark:bg-blue-950",
  },
  {
    value: "meal_card",
    label: "Yemek Kartı",
    icon: Utensils,
    activeClass: "bg-orange-50 ring-orange-500 text-orange-700 dark:bg-orange-950",
  },
  {
    value: "iban",
    label: "IBAN",
    icon: Landmark,
    activeClass: "bg-purple-50 ring-purple-500 text-purple-700 dark:bg-purple-950",
  },
];

const MEAL_CARD_BRANDS: { value: MealCardBrand; label: string }[] = [
  { value: "multinet", label: "Multinet" },
  { value: "setcard", label: "Setcard" },
  { value: "pluxee", label: "Pluxee" },
  { value: "edenred", label: "Edenred" },
  { value: "tokenflex", label: "Tokenflex" },
  { value: "metropol", label: "Metropol" },
];

interface PaymentPickerProps {
  selectedMethod: PaymentMethod;
  selectedBrand: MealCardBrand;
  onMethodChange: (method: PaymentMethod) => void;
  onBrandChange: (brand: MealCardBrand) => void;
}

export function PaymentPicker({
  selectedMethod,
  selectedBrand,
  onMethodChange,
  onBrandChange,
}: PaymentPickerProps) {
  return (
    <section>
      <SectionTitle icon={CreditCard} title="Ödeme" />
      <div className="grid grid-cols-2 gap-2">
        {PAYMENT_METHODS.map((m) => {
          const Icon = m.icon;
          const isActive = selectedMethod === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onMethodChange(m.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl py-3 px-2 ring-1 transition-all",
                isActive
                  ? `${m.activeClass} ring-2 shadow-sm`
                  : "ring-foreground/8 bg-card hover:bg-muted/40",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-semibold">{m.label}</span>
            </button>
          );
        })}
      </div>

      {selectedMethod === "meal_card" && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {MEAL_CARD_BRANDS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => onBrandChange(b.value)}
              className={cn(
                "rounded-lg py-1.5 px-2 text-xs font-medium ring-1 transition-all",
                selectedBrand === b.value
                  ? "bg-orange-100 ring-orange-400 text-orange-800 dark:bg-orange-950"
                  : "ring-foreground/8 hover:bg-muted/40",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
