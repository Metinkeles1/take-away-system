import { memo, useMemo } from "react";
import { Activity } from "lucide-react";
import { type Order } from "@/types";
import { statusConfig, DONUT_COLORS } from "@/app/dashboard/constants/dashboardConfig";
import { EmptyState } from "./EmptyState";

interface StatusDonutProps {
  statusBreakdown: Record<string, number>;
}

export const StatusDonut = memo(function StatusDonut({
  statusBreakdown,
}: StatusDonutProps) {
  const { segments, total, gradient } = useMemo(() => {
    const entries = Object.entries(statusBreakdown).filter(([, count]) => count > 0);
    const t = entries.reduce((s, [, c]) => s + c, 0);
    if (t === 0) return { segments: [], total: 0, gradient: "" };

    let cumPct = 0;
    const segs = entries.map(([status, count]) => {
      const pct = (count / t) * 100;
      const start = cumPct;
      cumPct += pct;
      return { status, count, pct, start, end: cumPct, color: DONUT_COLORS[status] ?? "#94a3b8" };
    });
    return { segments: segs, total: t, gradient: segs.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ") };
  }, [statusBreakdown]);

  if (total === 0) return <EmptyState icon={Activity} text="Henüz veri yok" />;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <div
          className="h-40 w-40 rounded-full"
          style={{
            background: `conic-gradient(${gradient})`,
            maskImage: "radial-gradient(circle, transparent 55%, black 56%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 55%, black 56%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="text-3xl font-bold text-gray-900">{total}</span>
          <span className="text-xs text-gray-400 font-medium">toplam</span>
        </div>
      </div>

      <div className="w-full space-y-2.5">
        {segments.map((s) => {
          const cfg = statusConfig[s.status as Order["status"]];
          return (
            <div key={s.status} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm text-gray-700 font-medium">{cfg?.label ?? s.status}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-900">{s.count}</span>
                <span className="text-xs text-gray-400 w-12 text-right font-medium">{s.pct.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
