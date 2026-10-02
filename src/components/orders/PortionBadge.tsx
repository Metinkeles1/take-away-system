import type { PortionOption } from "@/types";
import { portionLabel } from "@/lib/orders/items";
import { cn } from "@/lib/utils";

// Sipariş satırındaki porsiyonu ayrı bir rozet olarak gösterir. Ürün adının
// içine yazılınca (truncate) uzun adlarda kırpılıp kayboluyordu. Yarım ve
// 1.5 porsiyon tam porsiyondan farklı renkte: mutfak/kurye ilk bakışta ayırsın.
const TONES: Record<PortionOption["size"], string> = {
  half: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  full: "bg-muted text-foreground/80 ring-foreground/10",
  one_and_half: "bg-primary/15 text-primary ring-primary/30",
};

interface PortionBadgeProps {
  portion: Pick<PortionOption, "size" | "label">;
  className?: string;
}

export function PortionBadge({ portion, className }: PortionBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none ring-1 whitespace-nowrap",
        TONES[portion.size] ?? TONES.full,
        className,
      )}
    >
      {portionLabel(portion)}
    </span>
  );
}
