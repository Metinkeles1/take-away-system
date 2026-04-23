import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  color: keyof typeof COLOR_MAP;
  trend?: { pct: number; up: boolean } | null;
  trendLabel?: string;
}

const COLOR_MAP = {
  blue: { iconBg: "bg-blue-100", iconText: "text-blue-600", border: "border-l-blue-500" },
  emerald: { iconBg: "bg-emerald-100", iconText: "text-emerald-600", border: "border-l-emerald-500" },
  amber: { iconBg: "bg-amber-100", iconText: "text-amber-600", border: "border-l-amber-500" },
  violet: { iconBg: "bg-violet-100", iconText: "text-violet-600", border: "border-l-violet-500" },
} as const;

export const KPICard = memo(function KPICard({
  label,
  value,
  icon: Icon,
  color,
  trend,
  trendLabel,
}: KPICardProps) {
  const c = COLOR_MAP[color];
  return (
    <Card className={`bg-white rounded-2xl border shadow-sm border-l-4 ${c.border} hover:shadow-md transition-shadow`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
            <p className="text-2xl font-bold tracking-tight text-gray-900">{value}</p>
            {trend && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
                  trend.up ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
                }`}>
                  {trend.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(trend.pct)}%
                </span>
                {trendLabel && <span className="text-[10px] text-gray-400">{trendLabel}</span>}
              </div>
            )}
          </div>
          <div className={`h-11 w-11 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${c.iconText}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export function KPICardSkeleton() {
  return (
    <Card className="bg-white rounded-2xl border shadow-sm border-l-4 border-l-gray-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
          <Skeleton className="h-11 w-11 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}
