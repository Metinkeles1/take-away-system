"use client";

import { useEffect, useTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrderStore } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  ClipboardList,
  CheckCircle2,
  Bike,
  PlusCircle,
  XCircle,
  ChevronRight,
  Loader2,
  Phone,
  MapPin,
  Timer,
} from "lucide-react";
import { formatCurrency, formatDate, formatRelativeTime, cn } from "@/lib/utils";
import { type OrderStatus } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string; accent: string; icon: React.ElementType }
> = {
  pending: {
    label: "Beklemede",
    color: "bg-yellow-100 text-yellow-800",
    accent: "bg-yellow-400",
    icon: Clock,
  },
  preparing: {
    label: "Hazırlanıyor",
    color: "bg-blue-100 text-blue-800",
    accent: "bg-blue-500",
    icon: ClipboardList,
  },
  "on-the-way": {
    label: "Yolda",
    color: "bg-purple-100 text-purple-800",
    accent: "bg-purple-500",
    icon: Bike,
  },
  delivered: {
    label: "Teslim Edildi",
    color: "bg-green-100 text-green-800",
    accent: "bg-green-500",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "İptal",
    color: "bg-red-100 text-red-800",
    accent: "bg-red-400",
    icon: XCircle,
  },
};

const FILTER_TABS: { key: "all" | OrderStatus; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Beklemede" },
  { key: "preparing", label: "Hazırlanıyor" },
  { key: "on-the-way", label: "Yolda" },
  { key: "delivered", label: "Teslim" },
  { key: "cancelled", label: "İptal" },
];

const statusOrder: OrderStatus[] = [
  "pending",
  "preparing",
  "on-the-way",
  "delivered",
  "cancelled",
];

export default function OrdersPage() {
  const { orders, updateOrderStatus, loadOrders, isLoading } = useOrderStore();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");

  const filteredOrders =
    filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const counts: Record<"all" | OrderStatus, number> = {
    all: orders.length,
    pending: 0,
    preparing: 0,
    "on-the-way": 0,
    delivered: 0,
    cancelled: 0,
  };
  orders.forEach((o) => {
    counts[o.status] += 1;
  });

  useEffect(() => {
    loadOrders();

    const handleFocus = () => loadOrders();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="h-full flex flex-col px-3 pt-3 pb-6 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 lg:pb-8 overflow-y-auto">
      <div className="mb-3 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Siparişler</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
            Toplam {orders.length} sipariş
            {filter !== "all" && (
              <>
                {" · "}
                <span className="font-medium">{filteredOrders.length}</span> filtreli
              </>
            )}
          </p>
        </div>
        <Link href="/orders/new" className="shrink-0">
          <Button size="sm" className="sm:h-9 sm:px-4">
            <PlusCircle className="mr-1.5 sm:mr-2 h-4 w-4" />
            Yeni Sipariş
          </Button>
        </Link>
      </div>

      {/* Durum filtre tab'ları */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0 shrink-0">
        {FILTER_TABS.map((tab) => {
          const isActive = filter === tab.key;
          const count = counts[tab.key];
          const accent =
            tab.key !== "all" ? statusConfig[tab.key as OrderStatus].accent : "bg-foreground";
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0",
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {tab.key !== "all" && (
                <span className={cn("h-1.5 w-1.5 rounded-full", accent)} />
              )}
              {tab.label}
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

      <div className="flex-1 pt-px px-px">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="rounded-lg border p-4 flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="hidden md:flex flex-1 flex-wrap gap-1">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-8 w-40 rounded-md" />
                  <Skeleton className="h-7 w-16 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ClipboardList className="mb-4 h-16 w-16 opacity-20" />
              <p className="text-lg font-medium">
                {filter === "all" ? "Henüz sipariş yok" : "Bu durumda sipariş yok"}
              </p>
              <p className="mt-1 text-sm">
                {filter === "all"
                  ? "İlk siparişi almak için butona tıklayın"
                  : "Farklı bir filtre seçin veya yeni sipariş alın"}
              </p>
              {filter === "all" ? (
                <Link href="/orders/new" className="mt-4">
                  <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Yeni Sipariş Al
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setFilter("all")}
                >
                  Tüm Siparişleri Göster
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const config = statusConfig[order.status];
              const Icon = config.icon;
              const isNavigating = isPending && navigatingId === order.id;
              return (
                <Card
                  key={order.id}
                  className="transition-all hover:shadow-md hover:border-foreground/20 overflow-hidden relative"
                >
                  {/* Sol renk şeridi */}
                  <div
                    className={cn("absolute left-0 top-0 bottom-0 w-1", config.accent)}
                  />
                  <CardContent className="flex flex-col md:flex-row md:items-stretch gap-3 md:gap-4 p-4 pl-5">
                    {/* Sol: Sipariş + müşteri */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="font-bold text-lg">#{order.orderNumber}</span>
                        <span
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}
                        >
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          <Timer className="h-3 w-3" />
                          {formatRelativeTime(order.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{order.customer.name}</p>
                        {order.customer.phone && (
                          <a
                            href={`tel:${order.customer.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            {order.customer.phone}
                          </a>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {order.customer.address}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>

                    {/* Orta: Ürünler — md+ */}
                    <div className="hidden md:flex md:w-64 lg:w-80 flex-col border-l pl-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                        {order.items.length} kalem · {" "}
                        {order.items.reduce((s, i) => s + i.quantity, 0)} adet
                      </p>
                      <div className="space-y-1 overflow-hidden">
                        {order.items.slice(0, 4).map((item, idx) => (
                          <div
                            key={`${order.id}-item-${idx}`}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="inline-flex items-center justify-center min-w-[24px] h-5 rounded-md bg-muted text-[11px] font-bold px-1">
                              {item.quantity}x
                            </span>
                            <span className="truncate">{item.product.name}</span>
                          </div>
                        ))}
                        {order.items.length > 4 && (
                          <p className="text-xs text-muted-foreground pl-7">
                            +{order.items.length - 4} ürün daha
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Mobilde ürün özeti */}
                    <div className="md:hidden flex flex-wrap gap-1">
                      {order.items.slice(0, 3).map((item, idx) => (
                        <Badge
                          key={`${order.id}-mitem-${idx}`}
                          variant="secondary"
                          className="text-xs"
                        >
                          {item.quantity}x {item.product.name}
                        </Badge>
                      ))}
                      {order.items.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{order.items.length - 3}
                        </Badge>
                      )}
                    </div>

                    {/* Sağ: Tutar + aksiyon */}
                    <div className="flex md:flex-col items-end justify-between md:justify-center gap-2 md:gap-2 md:border-l md:pl-4 md:min-w-[180px]">
                      <div className="flex flex-col md:items-end">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Toplam
                        </span>
                        <span className="text-xl font-bold leading-tight">
                          {formatCurrency(order.total)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 md:w-full">
                        <Select
                          value={order.status}
                          onValueChange={(val) =>
                            updateOrderStatus(order.id, val as OrderStatus)
                          }
                        >
                          <SelectTrigger className="h-8 w-36 md:w-full text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOrder.map((s) => {
                              const c = statusConfig[s];
                              const SIcon = c.icon;
                              return (
                                <SelectItem key={s} value={s}>
                                  <span className="flex items-center gap-2">
                                    <SIcon className="h-3 w-3" />
                                    {c.label}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs md:w-full"
                          disabled={isNavigating}
                          onClick={() => {
                            setNavigatingId(order.id);
                            startTransition(() => {
                              router.push(`/orders/${order.id}`);
                            });
                          }}
                        >
                          {isNavigating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              Detay
                              <ChevronRight className="ml-1 h-3 w-3" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
