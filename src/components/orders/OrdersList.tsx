"use client";

import Link from "next/link";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  hasSearch?: boolean;
  onResetFilter: () => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
}

// OrderListCard cep boyu değişken (md+ farklı, ürün sayısına göre fark az)
// estimateSize ile başlangıç tahmini, measureElement gerçek yüksekliği ölçüp ayarlar
const ESTIMATE_HEIGHT = 180;
const OVERSCAN = 4;

export function OrdersList({
  isLoading,
  orders,
  filter,
  hasSearch = false,
  onResetFilter,
  onStatusChange,
}: OrdersListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATE_HEIGHT,
    overscan: OVERSCAN,
  });

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto pt-px px-px pb-2">
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
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="h-full overflow-y-auto pt-px px-px pb-2">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ClipboardList className="mb-4 h-16 w-16 opacity-20" />
            <p className="text-lg font-medium">
              {hasSearch
                ? "Eşleşen sipariş yok"
                : filter === "all"
                  ? "Henüz sipariş yok"
                  : "Bu durumda sipariş yok"}
            </p>
            <p className="mt-1 text-sm">
              {hasSearch
                ? "Farklı bir arama deneyin"
                : filter === "all"
                  ? "İlk siparişi almak için butona tıklayın"
                  : "Farklı bir filtre seçin veya yeni sipariş alın"}
            </p>
            {hasSearch || filter !== "all" ? (
              <Button variant="outline" className="mt-4" onClick={onResetFilter}>
                {hasSearch ? "Aramayı ve filtreyi temizle" : "Tüm Siparişleri Göster"}
              </Button>
            ) : (
              <Link href="/orders/new" className="mt-4">
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Yeni Sipariş Al
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto pt-px px-px pb-2">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const order = orders[virtualRow.index];
          return (
            <div
              key={order.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: 12,
              }}
            >
              <OrderListCard order={order} onStatusChange={onStatusChange} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
