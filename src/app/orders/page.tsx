"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrderStore } from "@/store/orderStore";
import {
  subscribeTrendyolWatcher,
  useTrendyolWatcherStore,
} from "@/store/trendyolWatcherStore";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { type Order, type OrderStatus } from "@/types";
import { IncomingOrderDialog } from "./_components/IncomingOrderDialog";

// Yeni sipariş tespiti global trendyolWatcher'da yapılıyor; bu sayfa sadece
// liste tazelemesi için periyodik loadOrders + dialog kuyruğunu yönetir.
const LIST_REFRESH_MS = 15_000;
import {
  OrderStatusFilters,
  type OrderFilter,
} from "./_components/OrderStatusFilters";
import { OrdersList } from "./_components/OrdersList";

export default function OrdersPage() {
  const { orders, updateOrderStatus, loadOrders, isLoading } = useOrderStore();
  const [filter, setFilter] = useState<OrderFilter>("all");
  // İlk fetch tamamlanana kadar skeleton göster (boş-state flash'ını önler)
  const [bootstrapping, setBootstrapping] = useState(orders.length === 0);
  // Yeni gelen 3. parti siparişleri sırayla göstermek için kuyruk
  const [incomingQueue, setIncomingQueue] = useState<Order[]>([]);
  const activeIncoming = incomingQueue[0] ?? null;

  // Trendyol watcher'ına abone — yeni sipariş cursor'ı ileri gittiğinde tetiklenir.
  const watcherCursor = useTrendyolWatcherStore((s) => s.cursor);
  useEffect(() => subscribeTrendyolWatcher(), []);

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

  // Watcher cursor'ı değişince (= yeni Trendyol siparişi tespit edildi):
  // listeyi anında tazele, ardından henüz dialog'a girmemiş olanları kuyruğa al.
  useEffect(() => {
    if (watcherCursor === 0) return; // ilk init — eski siparişleri kuyruğa atma
    let cancelled = false;
    void loadOrders().then(() => {
      if (cancelled) return;
      const current = useOrderStore.getState().orders;
      setIncomingQueue((q) => {
        const queued = new Set(q.map((o) => o.externalRef));
        const fresh = current.filter(
          (o) =>
            o.externalRef &&
            o.source !== "manual" &&
            (o.createdAt ? new Date(o.createdAt).getTime() : 0) >=
              watcherCursor - 1 &&
            !queued.has(o.externalRef),
        );
        return fresh.length > 0 ? [...q, ...fresh] : q;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watcherCursor]);

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

  // Filter chip'lerin tıklanması anlık hissedilir, ağır liste hesabı arkada gerçekleşir
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

      <IncomingOrderDialog
        order={activeIncoming}
        onClose={() => setIncomingQueue((q) => q.slice(1))}
      />
    </main>
  );
}
