import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import { type DiscountInput, type DiscountType } from "@/types";
import { QUICK_DISCOUNT_PERCENTS } from "@/lib/orders/discount";
import { BadgePercent, ChevronDown, X } from "lucide-react";

interface DiscountSectionProps {
  discount?: DiscountInput;
  /** Ara toplamdan düşen ₺ (store'da hesaplanır) */
  amount: number;
  onChange: (discount: DiscountInput | null) => void;
}

const MODES: { value: DiscountType; label: string }[] = [
  { value: "percent", label: "% Yüzde" },
  { value: "amount", label: "₺ Tutar" },
];

export function DiscountSection({ discount, amount, onChange }: DiscountSectionProps) {
  // İndirim varsa (düzenlemede yüklenen) açık başlar.
  const [open, setOpen] = useState(!!discount);
  const [mode, setMode] = useState<DiscountType>(discount?.type ?? "percent");

  const inputValue = discount?.type === mode ? String(discount.value) : "";

  const handleInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const n = Number(digits);
    if (!digits || n <= 0) return onChange(null);
    onChange({ type: mode, value: mode === "percent" ? Math.min(n, 100) : n });
  };

  const handleMode = (next: DiscountType) => {
    if (next === mode) return;
    setMode(next);
    onChange(null); // yüzde ↔ tutar geçişinde eski değer anlamını yitirir
  };

  return (
    <section>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
        >
          <BadgePercent className="h-3.5 w-3.5" />
          İndirim
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          />
        </button>
        {amount > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {discount?.type === "percent" && `%${discount.value} · `}−{formatCurrency(amount)}
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="İndirimi kaldır"
              className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => handleMode(m.value)}
                className={cn(
                  "rounded-md py-1.5 text-xs font-semibold transition-colors",
                  mode === m.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "percent" && (
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_DISCOUNT_PERCENTS.map((p) => {
                const active = discount?.type === "percent" && discount.value === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChange(active ? null : { type: "percent", value: p })}
                    className={cn(
                      "rounded-lg py-1.5 text-xs font-semibold ring-1 transition-all",
                      active
                        ? "bg-emerald-50 ring-2 ring-emerald-500 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "ring-foreground/8 hover:bg-muted/40",
                    )}
                  >
                    %{p}
                  </button>
                );
              })}
            </div>
          )}

          <div className="relative">
            <Input
              inputMode="numeric"
              placeholder={mode === "percent" ? "Başka oran" : "İndirim tutarı"}
              value={inputValue}
              onChange={(e) => handleInput(e.target.value)}
              className="h-9 pr-8 text-sm tabular-nums"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {mode === "percent" ? "%" : "₺"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
