import { useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const trafficChartConfig = {
  count: {
    label: "Sipariş",
    color: "rgb(59 130 246)",
  },
} satisfies ChartConfig;

export function HourlyTraffic({ hourly }: { hourly: number[] }) {
  const currentHour = useSyncExternalStore(
    () => () => {},
    () => new Date().getHours(),
    () => null,
  );

  const data = hourly.map((count, h) => ({
    hour: h,
    label: `${h.toString().padStart(2, "0")}:00`,
    count,
  }));

  const total = hourly.reduce((s, c) => s + c, 0);
  const max = Math.max(1, ...hourly);
  const peakHour = hourly.indexOf(max);

  if (total === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
        Bugün henüz sipariş yok
      </div>
    );
  }

  return (
    <ChartContainer config={trafficChartConfig} className="h-32 w-full">
      <AreaChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="traffic-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="currentColor"
          strokeOpacity={0.08}
        />
        <XAxis
          dataKey="hour"
          ticks={[0, 6, 12, 18, 23]}
          tickFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
          axisLine={false}
          tickLine={false}
          tickMargin={6}
          fontSize={10}
          stroke="currentColor"
          opacity={0.6}
        />
        <YAxis hide domain={[0, max * 1.2]} />
        <ChartTooltip
          cursor={{ stroke: "rgb(59 130 246)", strokeWidth: 1, strokeDasharray: "3 3" }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
              formatter={(value) => [`${value} sipariş`, ""]}
              indicator="line"
            />
          }
        />
        <Area
          dataKey="count"
          type="monotone"
          stroke="rgb(59 130 246)"
          strokeWidth={2}
          fill="url(#traffic-fill)"
          activeDot={{ r: 4, fill: "rgb(59 130 246)", stroke: "white", strokeWidth: 2 }}
        />
        <ReferenceDot
          x={peakHour}
          y={max}
          r={4}
          fill="rgb(99 102 241)"
          stroke="white"
          strokeWidth={2}
          label={{
            value: `↑ ${max}`,
            position: "top",
            fill: "rgb(99 102 241)",
            fontSize: 10,
            fontWeight: 600,
            offset: 6,
          }}
        />
        {currentHour !== null && (
          <ReferenceLine
            x={currentHour}
            stroke="rgb(59 130 246)"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
            label={{
              value: "şimdi",
              position: "insideTopRight",
              fill: "rgb(59 130 246)",
              fontSize: 9,
              fontWeight: 600,
              offset: 4,
            }}
          />
        )}
      </AreaChart>
    </ChartContainer>
  );
}
