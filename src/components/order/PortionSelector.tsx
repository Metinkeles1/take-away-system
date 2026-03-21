"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { type Product, type PortionOption, PORTION_OPTIONS } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface PortionSelectorProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onSelect: (product: Product, portion: PortionOption) => void;
}

export default function PortionSelector({
  product,
  open,
  onClose,
  onSelect,
}: PortionSelectorProps) {
  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">{product.name}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground text-center -mt-2 mb-1">
          Porsiyon seçin
        </p>

        <div className="grid gap-3 pt-1">
          {PORTION_OPTIONS.map((option) => {
            const portionPrice = Math.round(product.price * option.multiplier);
            return (
              <button
                key={option.size}
                onClick={() => {
                  onSelect(product, option);
                  onClose();
                }}
                className="flex items-center justify-between rounded-xl border-2 border-muted bg-muted/30 px-5 py-4 text-left transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-base">{option.label}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {option.multiplier === 0.5
                      ? "Yarım porsiyon"
                      : option.multiplier === 1
                        ? "Tam porsiyon"
                        : "Bir buçuk porsiyon"}
                  </span>
                </div>
                <span className="text-primary font-bold text-lg">
                  {formatCurrency(portionPrice)}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          className="mt-1 w-full text-muted-foreground"
          onClick={onClose}
        >
          İptal
        </Button>
      </DialogContent>
    </Dialog>
  );
}
