import { memo } from "react";
import { cn } from "@/lib/utils";
import { type OrdersPeriod } from "@/actions/orders";

const PERIOD_TABS: { key: OrdersPeriod; label: string }[] = [
  { key: "today", label: "Bugün" },
  { key: "week", label: "Bu hafta" },
  { key: "month", label: "Bu ay" },
  { key: "all", label: "Tümü" },
];

interface OrderPeriodFilterProps {
  period: OrdersPeriod;
  onChange: (period: OrdersPeriod) => void;
}

// Liste dönemini seçen segment kontrolü. Aktif sipariş ve açık hesaplar her
// dönemde görünür; bu yalnızca geçmişin ne kadar geriye gideceğini belirler.
// memo + stabil onChange ile arama yazılırken (hot path) yeniden render olmaz.
function OrderPeriodFilterImpl({ period, onChange }: OrderPeriodFilterProps) {
  return (
    <div className="inline-flex rounded-full bg-muted p-0.5 shrink-0">
      {PERIOD_TABS.map((tab) => {
        const isActive = period === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all whitespace-nowrap",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export const OrderPeriodFilter = memo(OrderPeriodFilterImpl);
