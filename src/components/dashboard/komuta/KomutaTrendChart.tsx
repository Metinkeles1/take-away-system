"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
  /** Baştaki/sondaki boş noktaları kırp (gün görünümünde gece saatleri). */
  trimEmptyEdges?: boolean;
}

// İlk/son dolu noktanın bir öncesi/sonrası kalır — eğri sıfırdan başlayıp sıfıra iner.
function trimEdges(data: SplitTrendPoint[]): SplitTrendPoint[] {
  const filled = (d: SplitTrendPoint) => d.own + d.trendyol > 0;
  const first = data.findIndex(filled);
  if (first === -1) return data;
  let last = data.length - 1;
  while (last > first && !filled(data[last])) last--;
  return data.slice(Math.max(0, first - 1), Math.min(data.length, last + 2));
}

const compactTL = (v: number) =>
  v >= 1000 ? `₺${(v / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}k` : `₺${v}`;

// Kendi = mavi, Trendyol = turuncu (kanal çipleriyle aynı dil).
const chartConfig = {
  own: { label: "Kendi", color: "#3b82f6" },
  trendyol: { label: "Trendyol", color: "#f97316" },
} satisfies ChartConfig;

export function KomutaTrendChart({ data: raw, title, description, isLoading, trimEmptyEdges }: Props) {
  const data = trimEmptyEdges ? trimEdges(raw) : raw;
  const hasTy = data.some((d) => d.trendyol > 0);
  const hasOwn = data.some((d) => d.own > 0);

  return (
    <Card className="h-full gap-3 shadow-xs">
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
      <CardContent className="flex flex-1 flex-col px-2 sm:px-6">
        {isLoading ? (
          <Skeleton className="min-h-64 w-full flex-1" />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto min-h-64 w-full flex-1">
            <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="komuta-own" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-own)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-own)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="komuta-ty" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-trendyol)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-trendyol)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 4" strokeOpacity={0.5} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                tickCount={4}
                tickFormatter={compactTL}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={<ChartTooltipContent indicator="dot" labelFormatter={(value) => value as string} />}
              />
              {/* Üst üste (yığılmamış) alanlar — her kanal kendi cirosu. */}
              {hasTy && (
                <Area
                  dataKey="trendyol"
                  name="Trendyol"
                  type="monotone"
                  stroke="var(--color-trendyol)"
                  strokeWidth={2}
                  fill="url(#komuta-ty)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
              <Area
                dataKey="own"
                name="Kendi"
                type="monotone"
                stroke="var(--color-own)"
                strokeWidth={2}
                fill="url(#komuta-own)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
