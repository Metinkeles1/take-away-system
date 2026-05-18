"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { type DashboardStats } from "@/actions/dashboard";

interface Props {
  stats: DashboardStats | null;
  isLoading: boolean;
}

const SOURCE_META: Record<string, { label: string; color: string }> = {
  cash: { label: "Nakit", color: "#10b981" },
  card: { label: "Kredi Kartı", color: "#3b82f6" },
  online: { label: "Online", color: "#a855f7" },
  meal_card: { label: "Yemek Kartı", color: "#f97316" },
  iban: { label: "IBAN", color: "#06b6d4" },
};

export function RevenueBreakdown({ stats, isLoading }: Props) {
  const segments = useMemo(() => {
    const raw: Record<string, number> = stats?.paymentBreakdownAll ?? {};
    return Object.entries(raw)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        key,
        label: SOURCE_META[key]?.label ?? key,
        color: SOURCE_META[key]?.color ?? "#94a3b8",
        value,
      }));
  }, [stats?.paymentBreakdownAll]);

  const total = useMemo(
    () => segments.reduce((s, x) => s + x.value, 0),
    [segments],
  );

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active =
    segments.find((s) => s.key === activeKey) ??
    [...segments].sort((a, b) => b.value - a.value)[0];

  const config: ChartConfig = useMemo(() => {
    const c: ChartConfig = {};
    for (const s of segments) {
      c[s.key] = { label: s.label, color: s.color };
    }
    return c;
  }, [segments]);

  return (
    <Card className="@container/card w-full">
      <CardHeader>
        <CardTitle>Gelir Kaynağı</CardTitle>
        <CardDescription>Ödeme yöntemine göre ciro dağılımı</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Dışa Aktar</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : segments.length === 0 ? (
          <p className="flex flex-1 items-center justify-center py-12 text-center text-sm text-muted-foreground">
            Henüz gelir verisi yok.
          </p>
        ) : (
          <div className="flex flex-1 flex-col items-center gap-3 @[440px]/card:grid @[440px]/card:grid-cols-2 @[440px]/card:items-stretch @[440px]/card:gap-4">
            {/* Donut */}
            <div className="relative mx-auto h-36 w-36 shrink-0 @[440px]/card:h-auto @[440px]/card:my-auto @[440px]/card:aspect-square @[440px]/card:w-full @[440px]/card:max-w-52">
              <ChartContainer config={config} className="size-full aspect-square">
                <PieChart>
                  <Pie
                    data={segments}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={2}
                    strokeWidth={0}
                    onMouseEnter={(_, idx) =>
                      setActiveKey(segments[idx]?.key ?? null)
                    }
                    onMouseLeave={() => setActiveKey(null)}
                  >
                    {segments.map((s) => (
                      <Cell key={s.key} fill={s.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-semibold tabular-nums">
                  {compactCurrency(active?.value ?? 0)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {active?.label ?? "Ciro"}
                </span>
              </div>
            </div>

            {/* Legend */}
            <ul className="w-full space-y-1 @[440px]/card:flex @[440px]/card:w-auto @[440px]/card:flex-col @[440px]/card:justify-evenly @[440px]/card:gap-1 @[440px]/card:space-y-0">
              {segments.map((s) => {
                const pct = total > 0 ? (s.value / total) * 100 : 0;
                const isActive = active?.key === s.key;
                return (
                  <li
                    key={s.key}
                    onMouseEnter={() => setActiveKey(s.key)}
                    onMouseLeave={() => setActiveKey(null)}
                    className={cn(
                      "flex cursor-default items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
                      isActive
                        ? "border-border bg-muted/60"
                        : "border-transparent hover:bg-muted/40",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="truncate text-xs font-medium">
                        {s.label}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                      <span className="text-xs font-semibold">
                        {compactCurrency(s.value)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function compactCurrency(amount: number): string {
  if (amount >= 1_000_000)
    return `${(amount / 1_000_000).toFixed(1).replace(".", ",")}M ₺`;
  if (amount >= 1_000)
    return `${(amount / 1_000).toFixed(1).replace(".", ",")}K ₺`;
  return formatCurrency(amount);
}
