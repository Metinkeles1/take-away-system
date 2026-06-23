"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import {
  Card,
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
import { Skeleton } from "@/components/ui/skeleton";
import type { SplitTrendPoint } from "@/actions/komutaOverview";

interface Props {
  data: SplitTrendPoint[];
  title: string;
  description: string;
  isLoading: boolean;
}

// Kendi = mavi, Trendyol = turuncu (kanal çipleriyle aynı dil).
const chartConfig = {
  own: { label: "Kendi", color: "#3b82f6" },
  trendyol: { label: "Trendyol", color: "#f97316" },
} satisfies ChartConfig;

export function KomutaTrendChart({ data, title, description, isLoading }: Props) {
  const hasTy = data.some((d) => d.trendyol > 0);
  const hasOwn = data.some((d) => d.own > 0);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex shrink-0 gap-3 pt-1 text-xs">
          {hasOwn && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-blue-500" /> Kendi
            </span>
          )}
          {hasTy && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-orange-500" /> Trendyol
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
            <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.5} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={<ChartTooltipContent indicator="dot" labelFormatter={(value) => value as string} />}
              />
              {/* Çizgi grafiği — her kanal kendi cirosu (dolgu yok). */}
              <Line
                dataKey="own"
                name="Kendi"
                type="monotone"
                stroke="var(--color-own)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
              {hasTy && (
                <Line
                  dataKey="trendyol"
                  name="Trendyol"
                  type="monotone"
                  stroke="var(--color-trendyol)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
