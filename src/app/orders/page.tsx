"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useOrderStore } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search, X } from "lucide-react";
import { type Order, type OrderStatus } from "@/types";
import { type OrdersPeriod } from "@/actions/orders";
import {
  OrderStatusFilters,
  type OrderFilter,
} from "@/components/orders/OrderStatusFilters";
import { OrderPeriodFilter } from "@/components/orders/OrderPeriodFilter";
import { OrdersList } from "@/components/orders/OrdersList";
import { useOrdersSync } from "@/hooks/useOrdersSync";

// Başlıktaki dönem etiketi (orders.ts'teki OrdersPeriod ile eşleşir).
const PERIOD_LABEL: Record<OrdersPeriod, string> = {
  today: "Bugün",
  week: "Son 7 gün",
  month: "Son 30 gün",
  all: "Tüm zamanlar",
};

// Bir siparişin aranabilir metnini kurar. Ağır olan kısım (join + Türkçe
// lower-case); arama indeksinde sipariş başına bir kez hesaplanır.
function buildHaystack(o: Order): string {
  return [
    String(o.orderNumber),
    o.customer.name,
    o.customer.phone,
    o.customer.address,
    o.externalRef,
    ...o.items.map((i) => i.product.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr");
}

export default function OrdersPage() {
  const { orders, ordersPeriod, updateOrderStatus, loadOrders, isLoading } =
    useOrderStore();
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [search, setSearch] = useState("");
  const [bootstrapping, setBootstrapping] = useState(orders.length === 0);

  useOrdersSync(() => setBootstrapping(false));

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

  // Arama indeksi: normalize edilmiş metinler yalnızca orders değişince kurulur.
  // Her tuş vuruşunda 2000 siparişin string'i yeniden üretilmez (hot path).
  const searchIndex = useMemo(() => orders.map(buildHaystack), [orders]);

  const deferredFilter = useDeferredValue(filter);
  const deferredSearch = useDeferredValue(search);
  const filteredOrders = useMemo(() => {
    const q = deferredSearch.trim().toLocaleLowerCase("tr");
    if (deferredFilter === "all" && !q) return orders;

    // Tek geçiş: durum filtresi + arama indeksi üzerinden includes.
    const result: Order[] = [];
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (deferredFilter !== "all" && o.status !== deferredFilter) continue;
      if (q && !searchIndex[i].includes(q)) continue;
      result.push(o);
    }
    return result;
  }, [orders, searchIndex, deferredFilter, deferredSearch]);

  // Stabil referanslar — memo'lu alt bileşenler (kart/filtre çubukları) hot
  // path'te (arama yazarken) gereksiz yeniden render olmasın.
  const handleStatusChange = useCallback(
    (id: string, status: OrderStatus) => {
      updateOrderStatus(id, status);
    },
    [updateOrderStatus],
  );
  const handlePeriodChange = useCallback(
    (p: OrdersPeriod) => void loadOrders({ period: p }),
    [loadOrders],
  );
  const handleResetFilter = useCallback(() => {
    setFilter("all");
    setSearch("");
  }, []);

  return (
    <main className="h-full flex flex-col px-3 pt-3 pb-6 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 lg:pb-8 overflow-hidden">
      <div className="mb-3 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Siparişler</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
            {PERIOD_LABEL[ordersPeriod]} · {orders.length} sipariş
            {(filter !== "all" || search.trim()) && (
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

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center shrink-0">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sipariş no, müşteri, telefon, adres veya ürün ara…"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Aramayı temizle"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <OrderPeriodFilter period={ordersPeriod} onChange={handlePeriodChange} />
      </div>

      {search.trim() && ordersPeriod !== "all" && (
        <p className="-mt-1 mb-2 text-xs text-muted-foreground shrink-0">
          Arama yalnızca {PERIOD_LABEL[ordersPeriod].toLocaleLowerCase("tr")}{" "}
          içinde.{" "}
          <button
            type="button"
            onClick={() => handlePeriodChange("all")}
            className="font-medium text-foreground underline underline-offset-2"
          >
            Tüm siparişlerde ara
          </button>
        </p>
      )}

      <OrderStatusFilters filter={filter} counts={counts} onChange={setFilter} />

      <div className="flex-1 min-h-0 pt-px px-px">
        <OrdersList
          isLoading={isLoading || bootstrapping}
          orders={filteredOrders}
          filter={filter}
          hasSearch={Boolean(search.trim())}
          onResetFilter={handleResetFilter}
          onStatusChange={handleStatusChange}
        />
      </div>
    </main>
  );
}
