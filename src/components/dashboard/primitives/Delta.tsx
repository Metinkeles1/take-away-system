import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeltaProps {
  value: number | null | undefined;
  // true → artış iyi (yeşil); false → artış kötü (örn. iade oranı, iptal)
  positiveIsGood?: boolean;
  className?: string;
}

export function Delta({ value, positiveIsGood = true, className }: DeltaProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const isGood = positiveIsGood ? up : !up;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
        isGood ? "text-emerald-600" : "text-rose-600",
        className,
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
