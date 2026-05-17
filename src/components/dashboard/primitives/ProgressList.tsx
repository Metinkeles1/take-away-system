import { cn } from "@/lib/utils";

export interface ProgressListItem {
  key: string;
  label: string;
  value: number;       // gösterilecek sayı (sipariş, miktar, ciro vb.)
  share?: number;      // 0..1; verilmezse value/max'tan hesaplanır
  meta?: string;       // sağda gösterilen ekstra (örn. "%24")
}

interface ProgressListProps {
  items: ProgressListItem[];
  formatValue?: (v: number) => string;
  className?: string;
  isLoading?: boolean;
}

export function ProgressList({
  items,
  formatValue = (v) => new Intl.NumberFormat("tr-TR").format(v),
  className,
  isLoading,
}: ProgressListProps) {
  if (isLoading) {
    return (
      <ul className={cn("px-4 py-2", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="py-1.5">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="mt-1 h-1 w-full animate-pulse rounded-full bg-muted/60" />
          </li>
        ))}
      </ul>
    );
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className={cn("px-4 py-2", className)}>
      {items.map((it) => {
        const share = it.share ?? it.value / max;
        return (
          <li key={it.key} className="group py-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate font-medium">{it.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatValue(it.value)}
                {it.meta ? ` · ${it.meta}` : ""}
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-foreground/80 transition-all group-hover:bg-foreground"
                style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
