"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { type Product, type PortionOption, PORTION_OPTIONS } from "@/types";
import { Plus } from "lucide-react";

interface PortionSelectorProps {
  product: Product;
  onSelect: (product: Product, portion: PortionOption) => void;
}

const PORTION_LABELS: Record<string, string> = {
  half: "0.5",
  full: "1",
  one_and_half: "1.5",
};

const PORTION_SUBLABELS: Record<string, string> = {
  half: "Yarım",
  full: "Tam",
  one_and_half: "Bir buçuk",
};

export default function PortionSelector({ product, onSelect }: PortionSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 overflow-hidden"
        align="center"
        side="bottom"
        sideOffset={8}
      >
        <p className="px-3 pt-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60">
          Porsiyon seçin
        </p>
        <div className="flex divide-x divide-border/60">
          {PORTION_OPTIONS.map((option) => (
            <button
              key={option.size}
              onClick={() => {
                onSelect(product, option);
                setOpen(false);
              }}
              className="group flex flex-col items-center gap-0.5 px-5 py-3 text-center transition-colors hover:bg-primary/5 active:bg-primary/10"
            >
              <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                {PORTION_LABELS[option.size]}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {PORTION_SUBLABELS[option.size]}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
