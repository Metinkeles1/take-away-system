import type { OrderItem } from "@/types";
import { cn } from "@/lib/utils";

// Satırın hızlı seçimleri ("Soğansız" vb.) ve serbest notu — sepet, sipariş
// detayı ve kurye ekranı aynı görünümü kullanır.
export function ItemOptionChips({
  item,
  className,
}: {
  item: Pick<OrderItem, "options" | "optionExtras" | "note">;
  className?: string;
}) {
  const options = item.options ?? [];
  const priceOf = (label: string) => item.optionExtras?.find((e) => e.label === label)?.price;
  const note = item.note?.trim();
  if (options.length === 0 && !note) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {options.map((o) => (
        <span
          key={o}
          className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-destructive ring-1 ring-destructive/20"
        >
          {o}
          {priceOf(o) ? <span className="ml-1 font-medium tabular-nums">+{priceOf(o)}₺</span> : null}
        </span>
      ))}
      {note && (
        <span className="text-[11px] italic leading-tight text-amber-700 dark:text-amber-300">
          “{note}”
        </span>
      )}
    </div>
  );
}
