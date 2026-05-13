import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Loader2 } from "lucide-react";
import { type Order, type OrderStatus } from "@/types";
import { cn, formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_CONFIG } from "@/lib/orderStatus";
import { useOrderStore } from "@/store/orderStore";
import { toast } from "sonner";

type ActiveStatus = "pending" | "preparing" | "on-the-way";
type ActiveFilter = "all" | ActiveStatus;

const STATUS_FILTERS: { key: ActiveFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Bekleyen" },
  { key: "preparing", label: "Hazırlanıyor" },
  { key: "on-the-way", label: "Yolda" },
];

interface ActiveOrdersCardProps {
  isLoading: boolean;
  allActiveOrders: Order[];
}

export function ActiveOrdersCard({
  isLoading,
  allActiveOrders,
}: ActiveOrdersCardProps) {
  const [statusFilter, setStatusFilter] = useState<ActiveFilter>("all");

  const activeOrders =
    statusFilter === "all"
      ? allActiveOrders
      : allActiveOrders.filter((o) => o.status === statusFilter);

  return (
    <Card className="flex flex-col flex-1 lg:min-h-0">
      <CardHeader className="flex flex-col gap-3 shrink-0 pb-3">
        <div className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Aktif Siparişler</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{activeOrders.length} sipariş</Badge>
            <Link
              href="/orders"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
            >
              Tümü →
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 -mx-1 px-1 overflow-x-auto scrollbar-hide">
          {STATUS_FILTERS.map((f) => {
            const count =
              f.key === "all"
                ? allActiveOrders.length
                : allActiveOrders.filter((o) => o.status === f.key).length;
            const isActive = statusFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-semibold",
                    isActive
                      ? "bg-background/20 text-background"
                      : "bg-background/60 text-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-4 lg:min-h-0 lg:overflow-y-auto scrollbar-hide">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle2 className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-sm">Şu anda aktif sipariş yok</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeOrders.map((order) => (
              <ActiveOrderRow key={order.id} order={order} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveOrderRow({ order }: { order: Order }) {
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const [isMarking, setIsMarking] = useState(false);
  const config = ORDER_STATUS_CONFIG[order.status];
  const Icon = config.icon;
  const isTrendyol = order.source === "trendyol";
  const canDeliver: boolean =
    order.status !== ("delivered" as OrderStatus) &&
    order.status !== ("cancelled" as OrderStatus);

  const handleDeliver = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMarking) return;
    setIsMarking(true);
    try {
      await updateOrderStatus(order.id, "delivered");
      toast.success(`#${order.orderNumber} teslim edildi`);
    } catch {
      toast.error("Durum güncellenirken hata oluştu");
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <Link
      href={`/orders/${order.id}`}
      className={cn(
        "relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3 transition-colors hover:bg-accent overflow-hidden",
        isTrendyol &&
          "border-emerald-200 bg-linear-to-r from-emerald-50/60 via-white to-white hover:from-emerald-100/60",
      )}
    >
      {/* Trendyol için sol kenar yeşil şerit */}
      {isTrendyol && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600" />
      )}
      <div className={cn("flex items-center gap-2 min-w-0", isTrendyol && "pl-2")}>
        {isTrendyol && (
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-black text-white shadow-sm"
            title="Trendyol GO"
          >
            T
          </span>
        )}
        <div className="text-sm min-w-0 flex items-center flex-wrap gap-x-2">
          <span className="font-semibold">#{order.orderNumber}</span>
          <span className="text-muted-foreground hidden sm:inline">·</span>
          <span className="truncate">{order.customer.name}</span>
        </div>
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0">
        <span className="text-sm font-medium">{formatCurrency(order.total)}</span>
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${config.color}`}
        >
          <Icon className="h-3 w-3" />
          {config.label}
        </span>
        {canDeliver && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs gap-1 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
            onClick={handleDeliver}
            disabled={isMarking}
          >
            {isMarking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Teslim Et
          </Button>
        )}
      </div>
    </Link>
  );
}
