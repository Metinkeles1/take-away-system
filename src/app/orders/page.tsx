"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrderStore } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search, X } from "lucide-react";
import { type Order, type OrderStatus } from "@/types";
import { type OrdersPeriod } from "@/actions/orders";
import {
  OrderActiveFilters,
  OrderFilters,
  matchesPayment,
  dateRangeLabel,
  dateRangeBounds,
  periodCovers,
  periodForDate,
  type ChannelFilter,
  type OrderDateRange,
  type OrderFilter,
  type PaymentFilter,
} from "@/components/orders/OrderFiltersPanel";
import { OrdersList } from "@/components/orders/OrdersList";
import { useOrdersSync } from "@/hooks/useOrdersSync";
import { getTrendyolOrdersForList } from "@/actions/trendyolArchive";
import { TrendyolOrderSheet } from "@/components/dashboard/komuta/TrendyolOrderSheet";

// Trendyol listesi arka planda bu aralıkla tazelenir (arşiv kendi içinde en
// fazla 1 dk bayat; yeni Trendyol siparişi listeye bu sürede düşer).
const TY_REFRESH_MS = 60 * 1000;

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
  const {
    orders: ownOrders,
    ordersPeriod,
    updateOrderStatus,
    loadOrders,
    isLoading,
  } = useOrderStore();
  const [channel, setChannel] = useState<ChannelFilter>("all");
  // Takvimden seçilen gün/aralık. Seçiliyken hazır dönem yerine geçer; veri
  // bu aralığı kapsayan dönemle yüklenir, süzme burada yapılır.
  const [dateRange, setDateRange] = useState<OrderDateRange | null>(null);
  const [tyOpen, setTyOpen] = useState<string | null>(null);

  // Trendyol siparişleri (arşiv, salt okunur) — kendi sipariş deposuna
  // karıştırılmaz; dönem değişince ve periyodik olarak ayrıca çekilir.
  const [tyFetched, setTyFetched] = useState<{ period: OrdersPeriod; orders: Order[] } | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    const load = () =>
      getTrendyolOrdersForList(ordersPeriod).then((r) => {
        if (alive) setTyFetched({ period: ordersPeriod, orders: r });
      });
    load();
    const t = setInterval(load, TY_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ordersPeriod]);
  const tyOrders = useMemo(
    () => (tyFetched?.period === ordersPeriod ? tyFetched.orders : []),
    [tyFetched, ordersPeriod],
  );

  // Kanal filtresi + yeni→eski birleşik liste (+ seçili tarih aralığı).
  const orders = useMemo(() => {
    let list: Order[];
    if (channel === "own") list = ownOrders;
    else if (channel === "trendyol") list = tyOrders;
    else if (tyOrders.length === 0) list = ownOrders;
    else
      list = [...ownOrders, ...tyOrders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    if (!dateRange) return list;
    const [start, end] = dateRangeBounds(dateRange);
    return list.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= start && t < end;
    });
  }, [channel, ownOrders, tyOrders, dateRange]);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [payFilter, setPayFilter] = useState<PaymentFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const payCounts = useMemo<Record<PaymentFilter, number>>(() => {
    const acc: Record<PaymentFilter, number> = {
      all: orders.length,
      cash: 0,
      card: 0,
      meal_card: 0,
      online: 0,
      iban: 0,
      open: 0,
    };
    orders.forEach((o) => {
      acc[o.payment.method] += 1;
      if (o.paymentStatus === "open") acc.open += 1;
    });
    return acc;
  }, [orders]);

  // Arama indeksi: normalize edilmiş metinler yalnızca orders değişince kurulur.
  // Her tuş vuruşunda 2000 siparişin string'i yeniden üretilmez (hot path).
  const searchIndex = useMemo(() => orders.map(buildHaystack), [orders]);

  const deferredFilter = useDeferredValue(filter);
  const deferredPay = useDeferredValue(payFilter);
  const deferredSearch = useDeferredValue(search);
  const filteredOrders = useMemo(() => {
    const q = deferredSearch.trim().toLocaleLowerCase("tr");
    if (deferredFilter === "all" && deferredPay === "all" && !q) return orders;

    // Tek geçiş: durum filtresi + arama indeksi üzerinden includes.
    const result: Order[] = [];
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (deferredFilter !== "all" && o.status !== deferredFilter) continue;
      if (!matchesPayment(o, deferredPay)) continue;
      if (q && !searchIndex[i].includes(q)) continue;
      result.push(o);
    }
    return result;
  }, [orders, searchIndex, deferredFilter, deferredPay, deferredSearch]);

  // Stabil referanslar — memo'lu alt bileşenler (kart/filtre çubukları) hot
  // path'te (arama yazarken) gereksiz yeniden render olmasın.
  const handleStatusChange = useCallback(
    (id: string, status: OrderStatus) => {
      updateOrderStatus(id, status);
    },
    [updateOrderStatus],
  );
  const handlePeriodChange = useCallback(
    (p: OrdersPeriod) => {
      setDateRange(null);
      void loadOrders({ period: p });
    },
    [loadOrders],
  );
  // Tarih seçilince, o günü kapsamayan dar bir dönem yüklüyse genişlet.
  const handleDateRangeChange = useCallback(
    (r: OrderDateRange | null) => {
      setDateRange(r);
      if (!r) return;
      const need = periodForDate(r.from);
      if (!periodCovers(ordersPeriod, need)) void loadOrders({ period: need });
    },
    [loadOrders, ordersPeriod],
  );
  const handleResetFilter = useCallback(() => {
    setDateRange(null);
    setChannel("all");
    setFilter("all");
    setPayFilter("all");
    setSearch("");
  }, []);

  return (
    <main className="h-full flex flex-col px-3 pt-3 pb-6 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 lg:pb-8 overflow-hidden">
      <div className="mb-3 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Siparişler</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
            {dateRange ? dateRangeLabel(dateRange) : PERIOD_LABEL[ordersPeriod]} ·{" "}
            {orders.length} sipariş
            {channel === "all" && tyOrders.length > 0 && (
              <> (Kendi {ownOrders.length} · Trendyol {tyOrders.length})</>
            )}
            {(filter !== "all" || payFilter !== "all" || search.trim()) && (
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

      <div className="mb-3 flex items-center gap-2 shrink-0">
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
        <OrderFilters
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          period={ordersPeriod}
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          channel={channel}
          status={filter}
          payment={payFilter}
          statusCounts={counts}
          paymentCounts={payCounts}
          resultCount={filteredOrders.length}
          onPeriodChange={handlePeriodChange}
          onChannelChange={setChannel}
          onStatusChange={setFilter}
          onPaymentChange={setPayFilter}
          onReset={handleResetFilter}
        />
      </div>

      {search.trim() && ordersPeriod !== "all" && !dateRange && (
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

      <OrderActiveFilters
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        channel={channel}
        status={filter}
        payment={payFilter}
        onChannelChange={setChannel}
        onStatusChange={setFilter}
        onPaymentChange={setPayFilter}
        onReset={handleResetFilter}
      />

      <div className="flex-1 min-h-0 pt-px px-px">
        <OrdersList
          isLoading={isLoading || bootstrapping}
          orders={filteredOrders}
          filter={filter}
          hasSearch={Boolean(search.trim()) || payFilter !== "all"}
          onResetFilter={handleResetFilter}
          onStatusChange={handleStatusChange}
          onOpenTrendyol={setTyOpen}
        />
      </div>

      <TrendyolOrderSheet orderNumber={tyOpen} onClose={() => setTyOpen(null)} />
    </main>
  );
}
