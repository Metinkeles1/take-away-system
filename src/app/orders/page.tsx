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
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { type OrderStatus } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: { label: "Beklemede", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  preparing: {
    label: "Hazırlanıyor",
    color: "bg-blue-100 text-blue-800",
    icon: ClipboardList,
  },
  "on-the-way": { label: "Yolda", color: "bg-purple-100 text-purple-800", icon: Bike },
  delivered: {
    label: "Teslim Edildi",
    color: "bg-green-100 text-green-800",
    icon: CheckCircle2,
  },
  cancelled: { label: "İptal", color: "bg-red-100 text-red-800", icon: XCircle },
};

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

  useEffect(() => {
    loadOrders();

    const handleFocus = () => loadOrders();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-4 pb-4 overflow-hidden">
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Siparişler</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Toplam {orders.length} sipariş
          </p>
        </div>
        <Link href="/orders/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Yeni Sipariş
          </Button>
        </Link>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
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
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ClipboardList className="mb-4 h-16 w-16 opacity-20" />
              <p className="text-lg font-medium">Henüz sipariş yok</p>
              <p className="mt-1 text-sm">İlk siparişi almak için butona tıklayın</p>
              <Link href="/orders/new" className="mt-4">
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Yeni Sipariş Al
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const config = statusConfig[order.status];
              const Icon = config.icon;
              return (
                <Card key={order.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    {/* Sol: Sipariş bilgisi */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-lg">#{order.orderNumber}</span>
                        <span
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}
                        >
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </span>
                      </div>
                      <p className="font-medium">{order.customer.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {order.customer.address}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>

                    {/* Orta: Ürünler */}
                    <div className="hidden md:block flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground mb-1">
                        {order.items.length} kalem ürün
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {order.items.slice(0, 3).map((item) => (
                          <Badge
                            key={item.product.id}
                            variant="secondary"
                            className="text-xs"
                          >
                            {item.quantity}x {item.product.name}
                          </Badge>
                        ))}
                        {order.items.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{order.items.length - 3} daha
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Sağ: Tutar + durum seç */}
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xl font-bold">
                        {formatCurrency(order.total)}
                      </span>
                      <Select
                        value={order.status}
                        onValueChange={(val) =>
                          updateOrderStatus(order.id, val as OrderStatus)
                        }
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
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
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isPending && navigatingId === order.id}
                        onClick={() => {
                          setNavigatingId(order.id);
                          startTransition(() => {
                            router.push(`/orders/${order.id}`);
                          });
                        }}
                      >
                        {isPending && navigatingId === order.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            Detay
                            <ChevronRight className="ml-1 h-3 w-3" />
                          </>
                        )}
                      </Button>
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
