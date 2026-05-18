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
import { cn, formatCurrency, formatPhone, formatRelativeTime } from "@/lib/utils";
import { type DashboardStats } from "@/actions/dashboard";

interface Props {
  stats: DashboardStats | null;
  isLoading: boolean;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Bekliyor",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  },
  preparing: {
    label: "Hazırlanıyor",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  },
  "on-the-way": {
    label: "Yolda",
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  },
  delivered: {
    label: "Tamamlandı",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  cancelled: {
    label: "İptal",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  },
};

export function RecentTransactions({ stats, isLoading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Son Siparişler</CardTitle>
        <CardDescription>Son müşteri işlemleri</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href="/orders">
              <Eye className="size-3.5" />
              <span className="hidden sm:inline">Tümünü Gör</span>
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))
        ) : (stats?.recentOrders?.length ?? 0) === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Henüz sipariş yok.
          </p>
        ) : (
          stats?.recentOrders.map((o) => {
            const status = STATUS_META[o.status] ?? {
              label: o.status,
              className: "bg-muted text-foreground",
            };
            return (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="flex items-center gap-3 rounded-md border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                <Avatar name={o.customerName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {o.customerName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    #{o.orderNumber}
                    {/* Telefon yoksa adı koruyor */}
                    <PhoneSuffix order={o} />
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn("border-transparent px-2", status.className)}
                >
                  {status.label}
                </Badge>
                <div className="flex w-24 shrink-0 flex-col items-end">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(o.total)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeTime(o.createdAt)}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function PhoneSuffix({
  order,
}: {
  order: DashboardStats["recentOrders"][number] & { phone?: string };
}) {
  // recentOrders şu an telefon taşımıyor — ileride eklenirse görünür.
  if (!order.phone) return null;
  return (
    <>
      {" · "}
      {formatPhone(order.phone)}
    </>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/80">
      {initials || "?"}
    </div>
  );
}
