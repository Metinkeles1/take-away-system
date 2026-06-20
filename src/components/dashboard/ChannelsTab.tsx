"use client";

import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { type ChannelBreakdown } from "@/actions/dashboard";

interface Props {
  data: ChannelBreakdown | null;
  isLoading: boolean;
  label: string;
}

// Kanal renkleri (mockup ile aynı).
const CHANNEL_COLOR: Record<string, { dot: string; bar: string }> = {
  trendyol: { dot: "bg-orange-500", bar: "bg-orange-500" },
  getir: { dot: "bg-violet-500", bar: "bg-violet-500" },
  yemeksepeti: { dot: "bg-pink-500", bar: "bg-pink-500" },
  manual: { dot: "bg-slate-500", bar: "bg-slate-500" },
};

// Trendyol'un mevcut detay ağacına köprü; diğerlerinin ayrı sayfası yok.
const CHANNEL_HREF: Record<string, string | undefined> = {
  trendyol: "/dashboard/trendyol",
};

export function ChannelsTab({ data, isLoading, label }: Props) {
  const channels = data?.channels ?? [];
  const total = data?.total ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Kanal kartları */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {channels.map((c) => {
          const pct = total > 0 ? (c.revenue / total) * 100 : 0;
          const color = CHANNEL_COLOR[c.source] ?? CHANNEL_COLOR.manual;
          const href = CHANNEL_HREF[c.source];
          const inner = (
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${color.dot}`} />
                  <span className="text-sm font-medium">{c.label}</span>
                </div>
                <p className="text-xl font-semibold tabular-nums">
                  {formatCurrency(c.revenue)}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {c.orderCount} sipariş · %{pct.toFixed(0)}
                </p>
                <p className="mt-1 text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                  Net ~{formatCurrency(c.net)}
                </p>
              </CardContent>
            </Card>
          );
          return href ? (
            <Link key={c.source} href={href}>
              {inner}
            </Link>
          ) : (
            <div key={c.source}>{inner}</div>
          );
        })}
      </div>

      {/* Kıyas barları */}
      <Card>
        <CardHeader>
          <CardTitle>Kanal Karşılaştırma — Ciro</CardTitle>
          <CardDescription>{label} · kanal bazlı ciro payı</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {total === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Bu gün satış yok.
            </p>
          ) : (
            channels.map((c) => {
              const pct = total > 0 ? (c.revenue / total) * 100 : 0;
              const color = CHANNEL_COLOR[c.source] ?? CHANNEL_COLOR.manual;
              return (
                <div key={c.source}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{c.label}</span>
                    <span className="tabular-nums font-medium">
                      {formatCurrency(c.revenue)}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${color.bar}`}
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
          <p className="pt-1 text-xs text-muted-foreground">
            Trendyol kartına/satırına tıklayınca detay paneli (yorum, kampanya,
            gün sonu) açılır.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
