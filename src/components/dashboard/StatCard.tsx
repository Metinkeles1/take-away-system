import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export type Delta = { kind: "up" | "down" | "flat" | "new"; pct: number };

export function computeDelta(current: number, previous: number): Delta {
  if (previous === 0 && current === 0) return { kind: "flat", pct: 0 };
  if (previous === 0) return { kind: "new", pct: 100 };
  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 1) return { kind: "flat", pct: 0 };
  return { kind: diff > 0 ? "up" : "down", pct: Math.round(Math.abs(diff)) };
}

function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.kind === "flat") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-medium text-muted-foreground">
        <Minus className="h-3 w-3" />
        eşit
      </span>
    );
  }
  if (delta.kind === "new") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-medium text-emerald-600">
        <ArrowUpRight className="h-3 w-3" />
        yeni
      </span>
    );
  }
  const isUp = delta.kind === "up";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-medium",
        isUp ? "text-emerald-600" : "text-red-600",
      )}
    >
      {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      %{delta.pct}
    </span>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  delta?: Delta;
  icon: React.ElementType;
  color: string;
  bg: string;
}

export function StatCard({ title, value, icon: Icon, color, bg, delta }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-6">
        <div className={`rounded-xl p-2.5 sm:p-3 ${bg} shrink-0`}>
          <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-lg sm:text-2xl font-bold truncate">{value}</p>
            {delta && <DeltaBadge delta={delta} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
