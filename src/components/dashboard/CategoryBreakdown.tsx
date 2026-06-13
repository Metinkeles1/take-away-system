"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { type DashboardStats } from "@/actions/dashboard";

interface Props {
  stats: DashboardStats | null;
  isLoading: boolean;
}

const CATEGORY_BAR: Record<string, string> = {
  kebap: "bg-red-500",
  pide: "bg-amber-500",
  lahmacun: "bg-orange-500",
  durum: "bg-emerald-500",
  kilo: "bg-blue-500",
  corba: "bg-yellow-500",
  tatli: "bg-pink-500",
  icecek: "bg-cyan-500",
};

export function CategoryBreakdown({ stats, isLoading }: Props) {
  const rows = stats?.categoryBreakdown ?? [];
  const total = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kategori Kırılımı</CardTitle>
        <CardDescription>Ciroya göre kategori payı</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Henüz kategori verisi yok.
          </p>
        ) : (
          rows.map((r) => {
            const pct = total > 0 ? (r.revenue / total) * 100 : 0;
            const color = CATEGORY_BAR[r.category] ?? "bg-slate-400";
            return (
              <div key={r.category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{r.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(r.revenue)} · %{pct.toFixed(0)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
