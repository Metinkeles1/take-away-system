"use client";

import { AlertTriangle, Bike, ChefHat, CheckCircle2, Clock } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type OperationalSnapshot } from "@/actions/dashboard";

interface Props {
  snapshot: OperationalSnapshot | null;
  isLoading: boolean;
}

// "Şu an ne oluyor" bandı — sadece bugün anlamlı. Geciken varsa bütün bant
// kırmızıya döner ki göz kaçırmasın.
export function OverviewOpsBanner({ snapshot, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-xl" />;
  }

  const s = snapshot;
  const hasLate = !!s && s.lateCount > 0;
  const nothingOpen =
    !!s && s.kitchenCount === 0 && s.onTheWayCount === 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border p-4",
        hasLate
          ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
          : "bg-card",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span
          className={cn(
            "inline-block size-2.5 rounded-full",
            hasLate ? "bg-rose-500 animate-pulse" : "bg-emerald-500",
          )}
        />
        Canlı Durum
      </div>

      {nothingOpen ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" />
          Şu an açık sipariş yok — her şey teslim edilmiş.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Stat icon={ChefHat} label="mutfakta" value={s?.kitchenCount ?? 0} />
          <Stat icon={Bike} label="yolda" value={s?.onTheWayCount ?? 0} />
          <Stat
            icon={AlertTriangle}
            label="geciken"
            value={s?.lateCount ?? 0}
            danger={hasLate}
          />
          {s?.avgDeliveryMin != null && (
            <Stat
              icon={Clock}
              label="ort. teslim (dk)"
              value={s.avgDeliveryMin}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn(
          "size-5",
          danger ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "text-2xl font-bold tabular-nums leading-none",
          danger && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
