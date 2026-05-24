"use client";

import { type Product, type PortionOption, PORTION_OPTIONS } from "@/types";
import { cn } from "@/lib/utils";

interface PortionSelectorProps {
  product: Product;
  onSelect: (portion: PortionOption) => void;
  className?: string;
}

const PORTION_LABELS: Record<string, string> = {
  half: "½",
  full: "1",
  one_and_half: "1½",
};

const PORTION_ARIA: Record<string, string> = {
  half: "Yarım porsiyon ekle",
  full: "Bir porsiyon ekle",
  one_and_half: "Bir buçuk porsiyon ekle",
};

export default function PortionSelector({
  product,
  onSelect,
  className,
}: PortionSelectorProps) {
  return (
    <div
      role="group"
      aria-label={`${product.name} porsiyon seçenekleri`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex items-stretch w-full rounded-lg ring-1 ring-foreground/10 overflow-hidden divide-x divide-foreground/10 bg-card/40",
        className,
      )}
    >
      {PORTION_OPTIONS.map((option) => {
        const isFull = option.size === "full";
        return (
          <button
            key={option.size}
            type="button"
            aria-label={PORTION_ARIA[option.size]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(option);
            }}
            className={cn(
              "flex-1 px-1 py-1.5 text-[12px] font-semibold tabular-nums leading-none transition-all cursor-pointer",
              "hover:bg-primary hover:text-primary-foreground active:scale-[0.96]",
              isFull
                ? "bg-primary/10 text-primary"
                : "bg-transparent text-foreground/80",
            )}
          >
            {PORTION_LABELS[option.size]}
          </button>
        );
      })}
    </div>
  );
}
