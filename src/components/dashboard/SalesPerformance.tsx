"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { type DashboardStats } from "@/actions/dashboard";

interface Props {
  stats: DashboardStats | null;
  isLoading: boolean;
}

type Range = "12m" | "6m" | "3m";

const RANGE_LABEL: Record<Range, string> = {
  "12m": "Son 12 ay",
  "6m": "Son 6 ay",
  "3m": "Son 3 ay",
};

const chartConfig = {
  revenue: { label: "Ciro", color: "var(--chart-1)" },
  target: { label: "Hedef", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function SalesPerformance({ stats, isLoading }: Props) {
  const [range, setRange] = useState<Range>("12m");

  // React Compiler otomatik memoize ediyor; manuel useMemo'nun optional-chain
  // dep'i compiler'ın çıkardığıyla uyuşmadığı için memoization bozuluyordu.
  const take = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const data = stats?.monthlyTrend ? stats.monthlyTrend.slice(-take) : [];

  return (
    <Card className="@container/card w-full">
      <CardHeader>
        <CardTitle>Satış Performansı</CardTitle>
        <CardDescription>Aylık ciro · hedefe karşı</CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger size="sm" className="w-36" aria-label="Periyot">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12m">{RANGE_LABEL["12m"]}</SelectItem>
                <SelectItem value="6m">{RANGE_LABEL["6m"]}</SelectItem>
                <SelectItem value="3m">{RANGE_LABEL["3m"]}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="size-3.5" />
              <span className="hidden sm:inline">Dışa Aktar</span>
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6">
        {isLoading ? (
          <Skeleton className="aspect-auto h-72 w-full" />
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-72 w-full"
          >
            <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-revenue)"
                    stopOpacity={0.5}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-revenue)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value: number) =>
                  value >= 1000
                    ? `${(value / 1000).toFixed(0)}k`
                    : String(value)
                }
              />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(value) => value as string}
                    formatter={(value, name, item) => (
                      <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-xs"
                            style={{ background: item.color }}
                          />
                          <span className="text-muted-foreground">
                            {name === "revenue" ? "Ciro" : "Hedef"}
                          </span>
                        </div>
                        <span className="font-mono font-medium tabular-nums">
                          {formatCurrency(value as number)}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Area
                dataKey="revenue"
                type="monotone"
                fill="url(#salesFill)"
                stroke="var(--color-revenue)"
                strokeWidth={2}
              />
              <Line
                dataKey="target"
                type="monotone"
                stroke="var(--color-target)"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
