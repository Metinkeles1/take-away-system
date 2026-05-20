"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { type DashboardStats } from "@/actions/dashboard";

interface SectionCardsProps {
  stats: DashboardStats | null;
  isLoading: boolean;
}

interface CardModel {
  description: string;
  value: string;
  trend: { pct: number; up: boolean } | null;
  footerTitle: string;
  footerHint: string;
}

export function SectionCards({ stats, isLoading }: SectionCardsProps) {
  const models = buildModels(stats);
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {models.map((m, i) => (
        <Card key={i} className="@container/card">
          <CardHeader>
            <CardDescription>{m.description}</CardDescription>
            <CardTitle className="text-xl font-semibold tabular-nums @[260px]/card:text-2xl @[360px]/card:text-3xl">
              {isLoading ? <Skeleton className="h-8 w-28" /> : m.value}
            </CardTitle>
            {m.trend && !isLoading && (
              <CardAction>
                <Badge variant="outline" className="gap-1 tabular-nums">
                  {m.trend.up ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <TrendingDown className="size-3" />
                  )}
                  {m.trend.up ? "+" : "−"}
                  {Math.abs(m.trend.pct)}%
                </Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1 text-sm">
            <div className="line-clamp-1 flex items-center gap-1.5 font-medium">
              {m.footerTitle}
              {m.trend?.up ? (
                <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
              ) : m.trend ? (
                <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
              ) : null}
            </div>
            <div className="text-muted-foreground">{m.footerHint}</div>
          </CardFooter>
        </Card>
      ))}
    </section>
  );
}

function buildModels(stats: DashboardStats | null): CardModel[] {
  if (!stats) {
    return [
      ph("Toplam Ciro", "Son 30 gün performansı"),
      ph("Aktif Müşteri", "Kayıtlı müşteri tabanı"),
      ph("Toplam Sipariş", "Son 30 gün sipariş adedi"),
      ph("Tamamlama Oranı", "Teslim edilen sipariş oranı"),
    ];
  }

  const trend = stats.revenueTrend ?? [];
  const last30 = trend.slice(-30);
  const prev30 = trend.slice(-60, -30);
  const revLast = sum(last30, (d) => d.revenue);
  const revPrev = sum(prev30, (d) => d.revenue);
  const ordLast = sum(last30, (d) => d.orders);
  const ordPrev = sum(prev30, (d) => d.orders);

  const months = stats.monthlyTrend ?? [];
  const thisMonthCust = months[months.length - 1]?.customers ?? 0;
  const lastMonthCust = months[months.length - 2]?.customers ?? 0;

  const statusTotal = Object.values(stats.statusBreakdown).reduce(
    (s, v) => s + v,
    0,
  );
  const delivered = stats.statusBreakdown.delivered ?? 0;
  const completion = statusTotal > 0 ? (delivered / statusTotal) * 100 : 0;

  return [
    {
      description: "Toplam Ciro",
      value: formatCurrency(revLast),
      trend: pct(revLast, revPrev),
      footerTitle: msg(pct(revLast, revPrev), "Bu ay ciro artıyor", "Bu ay ciro geriliyor"),
      footerHint: "Son 30 gün performansı",
    },
    {
      description: "Aktif Müşteri",
      value: stats.totalCustomerCount.toLocaleString("tr-TR"),
      trend: pct(thisMonthCust, lastMonthCust),
      footerTitle: msg(
        pct(thisMonthCust, lastMonthCust),
        "Müşteri kazanımı sürüyor",
        "Yeni müşteri sayısı azaldı",
      ),
      footerHint: "Sisteme kayıtlı müşteri tabanı",
    },
    {
      description: "Toplam Sipariş",
      value: ordLast.toLocaleString("tr-TR"),
      trend: pct(ordLast, ordPrev),
      footerTitle: msg(
        pct(ordLast, ordPrev),
        "Sipariş hacmi artıyor",
        "Sipariş hacmi geriliyor",
      ),
      footerHint: "Son 30 gün sipariş adedi",
    },
    {
      description: "Tamamlama Oranı",
      value: `${completion.toFixed(2)}%`,
      trend: null,
      footerTitle:
        completion >= 80
          ? "Sağlam tamamlama performansı"
          : "Tamamlama oranı izlemede",
      footerHint: "Teslim edilen / tüm siparişler",
    },
  ];
}

function ph(description: string, footerHint: string): CardModel {
  return {
    description,
    value: "—",
    trend: null,
    footerTitle: "—",
    footerHint,
  };
}

function sum<T>(arr: T[], fn: (x: T) => number): number {
  let s = 0;
  for (const x of arr) s += fn(x);
  return s;
}

function pct(current: number, previous: number): { pct: number; up: boolean } | null {
  if (previous === 0) {
    if (current === 0) return null;
    return { pct: 100, up: true };
  }
  const v = ((current - previous) / previous) * 100;
  return { pct: Math.round(v * 10) / 10, up: v >= 0 };
}

function msg(
  t: { up: boolean } | null,
  up: string,
  down: string,
): string {
  if (!t) return up;
  return t.up ? up : down;
}
