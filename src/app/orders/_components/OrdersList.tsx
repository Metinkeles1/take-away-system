import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, PlusCircle } from "lucide-react";
import { type Order, type OrderStatus } from "@/types";
import { OrderListCard } from "./OrderListCard";
import { type OrderFilter } from "./OrderStatusFilters";

interface OrdersListProps {
  isLoading: boolean;
  orders: Order[];
  filter: OrderFilter;
  onResetFilter: () => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
}

export function OrdersList({
  isLoading,
  orders,
  filter,
  onResetFilter,
  onStatusChange,
}: OrdersListProps) {
  if (isLoading) {
    return (
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
    );
  }

  if (orders.length === 0) {
    return (
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
            <Button variant="outline" className="mt-4" onClick={onResetFilter}>
              Tüm Siparişleri Göster
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <OrderListCard key={order.id} order={order} onStatusChange={onStatusChange} />
      ))}
    </div>
  );
}
