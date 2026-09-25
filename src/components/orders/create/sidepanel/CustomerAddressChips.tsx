import { MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomerAddress } from "@/types";

// Telefon tam eşleşince (kayıtlı müşteri, ≥2 adres) telefon alanının altında
// gösterilen kısa adres etiketleri — operatör tek tıkla adres değiştirebilsin.

const SHORT_LEN = 28;

function shortAddress(a: CustomerAddress): string {
  const text = a.address.trim();
  return text.length > SHORT_LEN ? `${text.slice(0, SHORT_LEN)}…` : text;
}

interface CustomerAddressChipsProps {
  addresses: CustomerAddress[];
  activeAddressId?: string;
  onSelect: (a: CustomerAddress) => void;
  onNew: () => void;
}

export function CustomerAddressChips({
  addresses,
  activeAddressId,
  onSelect,
  onNew,
}: CustomerAddressChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {addresses.map((a) => {
        const active = a.id === activeAddressId;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors max-w-full",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-muted-foreground border-input hover:bg-muted",
            )}
          >
            {a.geo && <MapPin className="h-3 w-3 shrink-0" />}
            <span className="truncate">{shortAddress(a)}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onNew}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
      >
        <Plus className="h-3 w-3" />
        Yeni adres
      </button>
    </div>
  );
}
