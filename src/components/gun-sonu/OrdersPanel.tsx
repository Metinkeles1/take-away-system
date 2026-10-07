"use client";

import { useMemo, useState } from "react";
import { Bike, List, Package, Search, X } from "lucide-react";

import type { EndOfDayOrder } from "@/actions/endOfDay";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/dashboard/komuta/KomutaUI";
import { TrendyolOrderSheet } from "@/components/dashboard/komuta/TrendyolOrderSheet";
import { cn, formatCurrency } from "@/lib/utils";

import {
  CHANNEL_DOT,
  EPSILON,
  METHOD_META,
  NO_COURIER,
  fmtMin,
  isLate,
  matchesFilter,
  scopedAmount,
  scopeFromKey,
  type OrderFilter,
} from "./meta";
import { OwnOrderSheet } from "./OwnOrderSheet";
import { ProductsView } from "./ProductsView";

export type PanelView = "orders" | "products";

interface Props {
  orders: EndOfDayOrder[];
  isLoading: boolean;
  targetMin: number;
  filter: OrderFilter;
  onFilterChange: (f: OrderFilter) => void;
  view: PanelView;
  onViewChange: (v: PanelView) => void;
}

const STATE_LABEL = { open: "Açık hesap", late: "Geç teslim", cancelled: "İptal" } as const;

// Günün siparişleri (kendi + Trendyol) — Para Defteri'nden gelen kapsamla süzülür.
// Kurye çipleri "kim kaç paket götürdü"yü verir; liste kendi içinde kayar.
// "Ürünler" görünümü aynı süzgeçle ürün bazında eline geçeni gösterir.
// Satıra tıklayınca sipariş yan panelde açılır — sayfadan ayrılmadan.
export function OrdersPanel({ orders, isLoading, targetMin, filter, onFilterChange, view, onViewChange }: Props) {
  const [tyOrder, setTyOrder] = useState<string | null>(null);
  const [ownOrder, setOwnOrder] = useState<string | null>(null);
  const openOrder = (o: EndOfDayOrder) => (o.id ? setOwnOrder(o.id) : setTyOrder(o.orderNumber));
  const set = (patch: Partial<OrderFilter>) => onFilterChange({ ...filter, ...patch });

  const couriers = useMemo(() => {
    const map = new Map<string, { n: number; mins: number[] }>();
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      // Trendyol GO paketini Trendyol kuryesi taşır → "kuryesiz" sayılmaz.
      if (!o.courier && o.channel === "trendyol") continue;
      const k = o.courier ?? NO_COURIER;
      const r = map.get(k) ?? { n: 0, mins: [] };
      r.n++;
      if (o.status === "delivered" && o.durationMin != null) r.mins.push(o.durationMin);
      map.set(k, r);
    }
    return [...map.entries()]
      .map(([key, r]) => ({ key, n: r.n, avg: r.mins.length ? r.mins.reduce((s, m) => s + m, 0) / r.mins.length : null }))
      .sort((a, b) => (a.key === NO_COURIER ? 1 : b.key === NO_COURIER ? -1 : b.n - a.n));
  }, [orders]);

  const list = useMemo(() => orders.filter((o) => matchesFilter(o, filter, targetMin)), [orders, filter, targetMin]);
  // Yöntem filtresinde bölünmüş siparişin yalnız ilgili parçası toplanır.
  const gross = list.reduce((s, o) => s + scopedAmount(o, filter.scope), 0);
  const tyNet = list.reduce((s, o) => s + (o.net ?? 0), 0);

  // Kanal düğmesi = defterdeki kapsamın kanal-only hâli ("ch-own"/"ch-trendyol").
  const channelValue = filter.scope?.key.startsWith("ch-") ? (filter.scope.channel ?? "all") : "all";
  const scopeChip = filter.scope && !filter.scope.key.startsWith("ch-") ? filter.scope : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Başlık: arama + kanal */}
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter.q ?? ""}
            onChange={(e) => set({ q: e.target.value || undefined })}
            placeholder="No, müşteri, mahalle ara"
            className="h-8 w-full rounded-lg border bg-background pr-3 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Kanal"
            value={channelValue}
            onChange={(v) => set({ scope: v === "all" ? undefined : scopeFromKey(`ch-${v}`) })}
            options={[
              { id: "all", label: "Tümü" },
              { id: "own", label: "Kendi", dot: "bg-blue-500" },
              { id: "trendyol", label: "Trendyol", dot: "bg-orange-500" },
            ]}
          />
          <Segmented
            ariaLabel="Görünüm"
            value={view}
            onChange={onViewChange}
            options={[
              { id: "orders", label: "Siparişler", icon: List },
              { id: "products", label: "Ürünler", icon: Package },
            ]}
          />
        </div>
      </div>

      {/* Kurye çipleri */}
      {couriers.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2">
          {couriers.map((c) => {
            const active = filter.courier === c.key;
            const slow = c.avg != null && c.avg > targetMin;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => set({ courier: active ? undefined : c.key })}
                aria-pressed={active}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active ? "border-foreground/30 bg-foreground/5 ring-1 ring-foreground/20" : "hover:bg-muted/60",
                )}
              >
                <Bike className={cn("size-3.5", c.key === NO_COURIER ? "text-muted-foreground" : "text-blue-500")} />
                <span className="font-medium">{c.key === NO_COURIER ? "Kuryesiz" : c.key}</span>
                <span className="tabular-nums text-muted-foreground">{c.n} paket</span>
                {c.avg != null && (
                  <span className={cn("tabular-nums", slow ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                    · {Math.round(c.avg)} dk
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Aktif filtreler + süzülen toplam */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          <b className="text-foreground tabular-nums">{list.length}</b> sipariş
        </span>
        {scopeChip && <ActiveChip label={scopeChip.label} onClear={() => set({ scope: undefined })} />}
        {filter.state && <ActiveChip label={STATE_LABEL[filter.state]} onClear={() => set({ state: undefined })} />}
        <span className="ml-auto flex gap-3 tabular-nums">
          <span>
            <span className="text-muted-foreground">Brüt </span>
            <b>{formatCurrency(gross)}</b>
          </span>
          {tyNet > EPSILON && (
            <span>
              <span className="text-muted-foreground">TY net </span>
              <b className="text-emerald-600 dark:text-emerald-400">{formatCurrency(tyNet)}</b>
            </span>
          )}
        </span>
      </div>

      {/* Liste — kendi içinde kayar */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : view === "products" ? (
          <ProductsView orders={list} />
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Bu filtreye uyan sipariş yok</p>
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Saat</th>
                  <th className="px-3 py-2 text-left font-medium">Sipariş</th>
                  <th className="px-3 py-2 text-left font-medium">Ödeme</th>
                  <th className="px-3 py-2 text-left font-medium">Kurye</th>
                  <th className="px-3 py-2 text-right font-medium">Süre</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <OrderRow key={o.key} o={o} targetMin={targetMin} onOpen={openOrder} />
                ))}
              </tbody>
            </table>
            <div className="divide-y md:hidden">
              {list.map((o) => (
                <OrderCard key={o.key} o={o} targetMin={targetMin} onOpen={openOrder} />
              ))}
            </div>
          </>
        )}
      </div>

      <TrendyolOrderSheet orderNumber={tyOrder} onClose={() => setTyOrder(null)} />
      <OwnOrderSheet id={ownOrder} onClose={() => setOwnOrder(null)} />
    </div>
  );
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium ring-1 ring-foreground/15 hover:bg-foreground/10"
    >
      {label}
      <X className="size-3" />
    </button>
  );
}

function PaymentCell({ o }: { o: EndOfDayOrder }) {
  const m = METHOD_META[o.method] ?? METHOD_META.other;
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
      {o.split ? (
        // Bölünmüş ödeme: "Nakit 300 + Kart 100"
        <span className="truncate" title="Bölünmüş ödeme">
          {o.split
            .map((p) => `${(METHOD_META[p.method] ?? METHOD_META.other).short} ${formatCurrency(p.amount)}`)
            .join(" + ")}
        </span>
      ) : (
        <span className="truncate">
          {o.channel === "trendyol" && o.method === "online" ? "Online kart" : m.short}
          {o.mealCardBrand && <span className="text-muted-foreground"> · {o.mealCardBrand}</span>}
        </span>
      )}
      {o.open && (
        <span className="rounded bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
          Açık
        </span>
      )}
    </span>
  );
}

function Duration({ o, targetMin }: { o: EndOfDayOrder; targetMin: number }) {
  if (o.status === "cancelled") return <span className="text-rose-600 dark:text-rose-400">İptal</span>;
  if (o.status !== "delivered") return <span className="text-muted-foreground">yolda</span>;
  return (
    <span className={cn("tabular-nums", isLate(o, targetMin) && "font-semibold text-rose-600 dark:text-rose-400")}>
      {fmtMin(o.durationMin)}
    </span>
  );
}

function Amount({ o, className }: { o: EndOfDayOrder; className?: string }) {
  const showNet = o.net != null && o.status !== "cancelled";
  return (
    <span className={cn("flex flex-col items-end gap-0.5", className)}>
      <span
        className={cn(
          "tabular-nums",
          showNet ? "text-xs text-muted-foreground" : "font-semibold",
          o.status === "cancelled" && "line-through opacity-60",
        )}
      >
        {showNet && "brüt "}
        {formatCurrency(o.total)}
      </span>
      {/* Trendyol: eline geçen net öne çıkar; ~ = ödeme kaydı yok, tahmini */}
      {showNet && (
        <span
          className="rounded bg-emerald-500/10 px-1.5 py-px text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400"
          title={o.netEstimated ? "Tahmini — Trendyol ödeme kaydı henüz yok" : "Trendyol ödeme kaydından (gerçek)"}
        >
          {o.netEstimated && "~"}
          {formatCurrency(o.net!)}
        </span>
      )}
    </span>
  );
}

function OrderRow({ o, targetMin, onOpen }: { o: EndOfDayOrder; targetMin: number; onOpen: (o: EndOfDayOrder) => void }) {
  return (
    <tr className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40" onClick={() => onOpen(o)}>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{o.time}</td>
      <td className="max-w-52 px-3 py-2">
        <span className="flex items-center gap-1.5 font-medium">
          <span className={cn("size-1.5 shrink-0 rounded-full", CHANNEL_DOT[o.channel])} />#{o.orderNumber}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {o.customer}
          {o.district && ` · ${o.district}`}
        </span>
      </td>
      <td className="max-w-48 px-3 py-2">
        <PaymentCell o={o} />
      </td>
      <td className="px-3 py-2">{o.courier ?? <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <Duration o={o} targetMin={targetMin} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Amount o={o} />
      </td>
    </tr>
  );
}

function OrderCard({ o, targetMin, onOpen }: { o: EndOfDayOrder; targetMin: number; onOpen: (o: EndOfDayOrder) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(o)}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className={cn("size-1.5 shrink-0 rounded-full", CHANNEL_DOT[o.channel])} />#{o.orderNumber}
          <span className="font-normal tabular-nums text-muted-foreground">· {o.time}</span>
        </span>
        <span className="truncate text-xs text-muted-foreground">{o.customer}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <PaymentCell o={o} />
          {o.courier && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Bike className="size-3" /> {o.courier}
            </span>
          )}
          <Duration o={o} targetMin={targetMin} />
        </span>
      </div>
      <Amount o={o} className="shrink-0 text-sm" />
    </button>
  );
}
