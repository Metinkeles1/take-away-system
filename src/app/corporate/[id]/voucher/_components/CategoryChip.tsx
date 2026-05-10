import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/products/ProductImage";

interface CategoryChipProps {
  label: string;
  emoji: string;
  imageSrc?: string;
  fallbackSrc?: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

export function CategoryChip({
  label,
  emoji,
  imageSrc,
  fallbackSrc,
  count,
  isActive,
  onClick,
}: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full pl-1 pr-3 py-1 transition-all shrink-0 ring-1",
        isActive
          ? "bg-foreground text-background ring-foreground shadow-sm"
          : "bg-card text-foreground ring-foreground/10 hover:ring-foreground/25 hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "h-7 w-7 rounded-full overflow-hidden flex items-center justify-center text-sm shrink-0",
          isActive ? "ring-1 ring-background/30" : "ring-1 ring-foreground/8",
        )}
      >
        {imageSrc && fallbackSrc ? (
          <ProductImage
            src={imageSrc}
            alt={label}
            fallbackSrc={fallbackSrc}
            placeholderClassName="h-full w-full"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-linear-to-br from-muted to-muted/40">
            {emoji}
          </div>
        )}
      </div>
      <span className="text-xs font-medium leading-tight whitespace-nowrap">{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-semibold leading-tight tabular-nums",
          isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
