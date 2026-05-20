import { cn } from "@/lib/utils";
import { type OrderStatus } from "@/types";
import { ORDER_STATUS_CONFIG } from "@/lib/orderStatus";

export type OrderFilter = "all" | OrderStatus;

const FILTER_TABS: { key: OrderFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Beklemede" },
  { key: "preparing", label: "Hazırlanıyor" },
  { key: "on-the-way", label: "Yolda" },
  { key: "delivered", label: "Teslim" },
  { key: "cancelled", label: "İptal" },
];

interface OrderStatusFiltersProps {
  filter: OrderFilter;
  counts: Record<OrderFilter, number>;
  onChange: (filter: OrderFilter) => void;
}

export function OrderStatusFilters({
  filter,
  counts,
  onChange,
}: OrderStatusFiltersProps) {
  return (
    <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0 shrink-0">
      {FILTER_TABS.map((tab) => {
        const isActive = filter === tab.key;
        const count = counts[tab.key];
        const accent =
          tab.key !== "all"
            ? ORDER_STATUS_CONFIG[tab.key as OrderStatus].accent
            : "bg-foreground";
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0",
              isActive
                ? "bg-foreground text-background shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {tab.key !== "all" && (
              <span className={cn("h-1.5 w-1.5 rounded-full", accent)} />
            )}
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-semibold",
                isActive
                  ? "bg-background/20 text-background"
                  : "bg-background/60 text-foreground",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
