import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Banknote, CheckCheck, CheckCircle2, CreditCard, Loader2, Wallet } from "lucide-react";
import { type Order, type OrderStatus } from "@/types";
import { cn, formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_CONFIG } from "@/lib/orderStatus";
import { useOrderStore } from "@/store/orderStore";
import { toast } from "sonner";
import {
  getCourierCash,
  handOverAllCourierCash,
  handOverCourierCash,
  type CourierCashOrder,
  type CourierCashState,
} from "@/actions/courierCash";
import { subscribeOrders } from "@/lib/pusher/client";

type ActiveStatus = "pending" | "preparing" | "on-the-way";
// "cash": teslim edilmiş ama kapıda alınan parası kasaya henüz gelmemiş siparişler.
type ActiveFilter = "all" | ActiveStatus | "cash";

const STATUS_FILTERS: { key: ActiveFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Bekleyen" },
  { key: "preparing", label: "Hazırlanıyor" },
  { key: "on-the-way", label: "Yolda" },
  { key: "cash", label: "Kasa bekleyen" },
];

type PendingCash = CourierCashOrder & { courier: string };

// Kapıda ödemeli, teslim edilmiş ama kasaya teslim alınmamış siparişler (yerel +
// kurye ekranından teslim edilen Trendyol). Pusher ile canlı tazelenir.
function usePendingCash() {
  const [state, setState] = useState<CourierCashState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(() => {
    getCourierCash().then(setState, () => {});
  }, []);
  useEffect(() => {
    load();
    const unsub = subscribeOrders(load);
    const t = setInterval(() => {
      setNow(Date.now());
      load();
    }, 60_000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [load]);
  const items: PendingCash[] = (state?.rows ?? [])
    .flatMap((r) => r.orders.map((o) => ({ ...o, courier: r.courier })))
    .sort((a, b) => a.deliveredAt.localeCompare(b.deliveredAt));
  return { items, alert: state?.alert ?? null, now, reload: load };
}

interface ActiveOrdersCardProps {
  isLoading: boolean;
  allActiveOrders: Order[];
}

export function ActiveOrdersCard({
  isLoading,
  allActiveOrders,
}: ActiveOrdersCardProps) {
  const [statusFilter, setStatusFilter] = useState<ActiveFilter>("all");
  const cash = usePendingCash();
  const [handingAll, setHandingAll] = useState(false);

  const activeOrders =
    statusFilter === "all"
      ? allActiveOrders
      : statusFilter === "cash"
        ? []
        : allActiveOrders.filter((o) => o.status === statusFilter);
  const cashItems = statusFilter === "all" || statusFilter === "cash" ? cash.items : [];
  const cashTotal = cash.items.filter((o) => o.method === "cash").reduce((s, o) => s + o.amount, 0);
  const cardTotal = cash.items.filter((o) => o.method === "card").reduce((s, o) => s + o.amount, 0);

  const handleAll = async () => {
    if (handingAll || cash.items.length === 0) return;
    const ok = window.confirm(
      `${cash.items.length} siparişin parası teslim alındı olarak işaretlenecek.\nNakit ${formatCurrency(cashTotal)} · Kart ${formatCurrency(cardTotal)}\nDevam edilsin mi?`,
    );
    if (!ok) return;
    setHandingAll(true);
    const res = await handOverAllCourierCash(cash.items.map((o) => ({ source: o.source, ref: o.ref })));
    setHandingAll(false);
    if (res.ok) toast.success(`${res.count} siparişin parası teslim alındı`);
    else toast.error(res.error ?? "Teslim kaydedilemedi");
    cash.reload();
  };

  return (
    <Card className="flex flex-col flex-1 lg:min-h-0">
      <CardHeader className="flex flex-col gap-3 shrink-0 pb-3">
        <div className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Aktif Siparişler</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{activeOrders.length + cashItems.length} sipariş</Badge>
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
                ? allActiveOrders.length + cash.items.length
                : f.key === "cash"
                  ? cash.items.length
                  : allActiveOrders.filter((o) => o.status === f.key).length;
            // Kasa bekleyen yoksa o filtreyi gösterme (liste sade kalsın).
            if (f.key === "cash" && count === 0 && statusFilter !== "cash") return null;
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
        ) : activeOrders.length === 0 && cashItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle2 className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-sm">
              {statusFilter === "cash" ? "Kasaya teslim bekleyen para yok" : "Şu anda aktif sipariş yok"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeOrders.map((order) => (
              <ActiveOrderRow key={order.id} order={order} />
            ))}
            {cashItems.length > 0 && (
              <>
                {/* Teslim edildi ama parası kasaya gelmedi — tek tek ya da hepsi birden teslim al */}
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2",
                    activeOrders.length > 0 && "mt-2 border-t pt-3",
                  )}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      <Wallet className="h-3.5 w-3.5 text-amber-600" />
                      Kasaya teslim bekleyen
                    </p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      Nakit {formatCurrency(cashTotal)} · Kart {formatCurrency(cardTotal)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => void handleAll()}
                    disabled={handingAll}
                  >
                    {handingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                    Hepsini teslim aldım
                  </Button>
                </div>
                {cashItems.map((o) => (
                  <PendingCashRow
                    key={`${o.source}:${o.ref}`}
                    item={o}
                    late={
                      !!cash.alert &&
                      o.method === "cash" &&
                      cash.now - new Date(o.deliveredAt).getTime() >= cash.alert.minutes * 60_000
                    }
                    onDone={cash.reload}
                  />
                ))}
              </>
            )}
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

// Teslim edilmiş, kapıda ödemeli sipariş — parası kasaya gelince "Teslim aldım".
function PendingCashRow({
  item,
  late,
  onDone,
}: {
  item: PendingCash;
  late: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isTrendyol = item.source === "trendyol";
  const MethodIcon = item.method === "cash" ? Banknote : CreditCard;
  const time = new Date(item.deliveredAt).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });

  const handle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const res = await handOverCourierCash({
      courier: item.courier,
      refs: [{ source: item.source, ref: item.ref }],
    });
    setBusy(false);
    if (res.ok) toast.success(`#${item.orderNumber} — ${formatCurrency(item.amount)} teslim alındı`);
    else toast.error(res.error ?? "Teslim kaydedilemedi");
    onDone();
  };

  const className = cn(
    "flex flex-col gap-2 rounded-lg border border-dashed p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
    late ? "border-rose-300 bg-rose-50/60 dark:bg-rose-500/10" : "bg-amber-50/40 dark:bg-amber-500/5",
    !isTrendyol && "hover:bg-accent",
  );

  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {isTrendyol && (
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-black text-white shadow-sm"
            title="Trendyol"
          >
            T
          </span>
        )}
        <div className="min-w-0 text-sm">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold">#{item.orderNumber}</span>
            {item.customer && <span className="truncate text-muted-foreground">{item.customer}</span>}
          </div>
          <p
            className={cn(
              "text-[11px]",
              late ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground",
            )}
          >
            {time} teslim edildi · {item.courier || "Kurye belirtilmemiş"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end sm:gap-3">
        <span className="text-sm font-medium tabular-nums">{formatCurrency(item.amount)}</span>
        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium">
          <MethodIcon className="h-3 w-3" />
          {item.method === "cash" ? "Nakit" : "Kart"}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          onClick={handle}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          Teslim aldım
        </Button>
      </div>
    </>
  );

  // Yerel sipariş detayına gider; Trendyol siparişinin yerel detay sayfası yok.
  return isTrendyol ? (
    <div className={className}>{content}</div>
  ) : (
    <Link href={`/orders/${item.ref}`} className={className}>
      {content}
    </Link>
  );
}
