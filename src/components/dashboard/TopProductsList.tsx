"use client";

import Link from "next/link";
import { Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { type DashboardStats } from "@/actions/dashboard";

type ProductRow = DashboardStats["menuPreferences"][number];

interface Props {
  stats: DashboardStats | null;
  isLoading: boolean;
  /** Verilirse bu liste gösterilir; verilmezse stats.menuPreferences (tüm zaman). */
  products?: ProductRow[];
  title?: string;
  description?: string;
  emptyText?: string;
  /** "Tümünü Gör" linkini göster (varsayılan açık). */
  showAction?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  kebap: "Kebap",
  pide: "Pide",
  lahmacun: "Lahmacun",
  durum: "Dürüm",
  kilo: "Kilo İşi",
  corba: "Çorba",
  tatli: "Tatlı",
  icecek: "İçecek",
};

export function TopProductsList({
  stats,
  isLoading,
  products,
  title = "En Çok Satan Ürünler",
  description = "Bu ayın en iyi performansı",
  emptyText = "Henüz ürün satışı yok.",
  showAction = true,
}: Props) {
  const rows = (products ?? stats?.menuPreferences ?? []).slice(0, 5);
  const maxRevenue = rows[0]?.revenue ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {showAction && (
          <CardAction>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href="/products">
                <Eye className="size-3.5" />
                <span className="hidden sm:inline">Tümünü Gör</span>
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          rows.map((p, i) => {
            const sharePct = (p.revenue / maxRevenue) * 100;
            const categoryLabel =
              CATEGORY_LABELS[p.category] ?? p.categoryLabel ?? p.category;
            return (
              <div
                key={p.name}
                className="flex items-center gap-3 rounded-md border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-xs font-semibold tabular-nums text-muted-foreground">
                  #{i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      {categoryLabel}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 w-24 max-w-[60%] overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/70"
                        style={{ width: `${Math.max(sharePct, 4)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {p.quantity} adet · {p.orderCount} sipariş
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(p.revenue)}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {sharePct.toFixed(0)}% pay
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
