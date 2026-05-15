"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrderStore } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { type OrderStatus } from "@/types";

const LIST_REFRESH_MS = 15_000;
import {
  OrderStatusFilters,
  type OrderFilter,
} from "./_components/OrderStatusFilters";
import { OrdersList } from "./_components/OrdersList";

export default function OrdersPage() {
  const { orders, updateOrderStatus, loadOrders, isLoading } = useOrderStore();
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [bootstrapping, setBootstrapping] = useState(orders.length === 0);

  useEffect(() => {
    loadOrders().finally(() => setBootstrapping(false));

    const handleFocus = () => loadOrders();
    window.addEventListener("focus", handleFocus);

    const poll = setInterval(() => {
      if (document.hidden) return;
      void loadOrders();
    }, LIST_REFRESH_MS);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo<Record<OrderFilter, number>>(() => {
    const acc: Record<OrderFilter, number> = {
      all: orders.length,
      pending: 0,
      preparing: 0,
      "on-the-way": 0,
      delivered: 0,
      cancelled: 0,
    };
    orders.forEach((o) => {
      acc[o.status] += 1;
    });
    return acc;
  }, [orders]);

  const deferredFilter = useDeferredValue(filter);
  const filteredOrders = useMemo(
    () =>
      deferredFilter === "all"
        ? orders
        : orders.filter((o) => o.status === deferredFilter),
    [orders, deferredFilter],
  );

  const handleStatusChange = (id: string, status: OrderStatus) => {
    updateOrderStatus(id, status);
  };

  return (
    <main className="h-full flex flex-col px-3 pt-3 pb-6 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 lg:pb-8 overflow-hidden">
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

      <OrderStatusFilters filter={filter} counts={counts} onChange={setFilter} />

      <div className="flex-1 min-h-0 pt-px px-px">
        <OrdersList
          isLoading={isLoading || bootstrapping}
          orders={filteredOrders}
          filter={filter}
          onResetFilter={() => setFilter("all")}
          onStatusChange={handleStatusChange}
        />
      </div>
    </main>
  );
}
