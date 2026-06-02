"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, Phone, MapPin, ChevronRight, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RelativeTime } from "@/components/RelativeTime";
import { CollectPaymentDialog } from "@/components/orders/CollectPaymentDialog";
import { subscribeOrders } from "@/lib/pusher/client";
import { getOpenAccounts, collectOpenAccount } from "@/actions/orders";
import type { Order, PaymentInfo } from "@/types";
import { toast } from "sonner";

// Tek satır — memoize: bir tahsilat sonrası diğer kartlar yeniden render olmasın.
const OpenAccountRow = memo(function OpenAccountRow({
  order,
  onCollectClick,
}: {
  order: Order;
  onCollectClick: (order: Order) => void;
}) {
  return (
    <Card className="overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
      <CardContent className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4 pl-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-lg">#{order.orderNumber}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium dark:bg-amber-950 dark:text-amber-300">
              Açık Hesap
            </span>
            <span className="text-[11px] text-muted-foreground">
              <RelativeTime date={order.createdAt} />
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">{order.customer.name}</p>
            {order.customer.phone && (
              <a
                href={`tel:${order.customer.phone}`}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
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

        <div className="flex items-end md:flex-col md:items-end justify-between gap-2 md:min-w-50">
          <div className="flex flex-col md:items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Tutar
            </span>
            <span className="text-xl font-bold leading-tight tabular-nums">
              {formatCurrency(order.total)}
            </span>
          </div>
          <div className="flex gap-2 md:w-full">
            <Button
              size="sm"
              className="h-9 flex-1 bg-amber-600 hover:bg-amber-700"
              onClick={() => onCollectClick(order)}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Tahsil Et
            </Button>
            <Button variant="outline" size="sm" className="h-9" asChild>
              <Link href={`/orders/${order.id}`} prefetch={false}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default function OpenAccountsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  // İndeksli sorgu: sadece açık hesapları çeker (tüm koleksiyonu değil).
  // inFlightRef ile eşzamanlı refetch'leri (pusher + focus üst üste gelince) bir'e indirger.
  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const data = await getOpenAccounts();
      if (mountedRef.current) setOrders(data);
    } catch {
      // sessizce geç — bir sonraki tetikte tekrar denenir
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeOrders(() => void load());
    return () => {
      mountedRef.current = false;
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [load]);

  const totalDue = useMemo(
    () => orders.reduce((sum, o) => sum + o.total, 0),
    [orders],
  );

  const handleCollectClick = useCallback((order: Order) => {
    setTarget(order);
    setDialogOpen(true);
  }, []);

  const handleCollect = useCallback(
    async (payment: PaymentInfo) => {
      if (!target) return;
      const { id, orderNumber } = target;
      // Optimistic: tahsil edilen sipariş listeden anında düşer.
      setOrders((prev) => prev.filter((o) => o.id !== id));
      const res = await collectOpenAccount(id, payment);
      if (!res.ok) {
        toast.error(res.error ?? "Tahsilat başarısız");
        void load(); // geri al — taze listeyi çek
        return;
      }
      toast.success(`#${orderNumber} tahsil edildi`);
    },
    [target, load],
  );

  return (
    <main className="h-full flex flex-col px-3 pt-3 pb-6 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 lg:pb-8 overflow-hidden">
      <div className="mb-3 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Açık Hesaplar</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
            Ödemesi alınmamış {orders.length} sipariş
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-2 text-right dark:bg-amber-950/40">
          <p className="text-[10px] uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80">
            Toplam Alacak
          </p>
          <p className="text-lg sm:text-xl font-bold text-amber-800 dark:text-amber-200 tabular-nums">
            {formatCurrency(totalDue)}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pt-px px-px pb-2">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-lg border p-4 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Wallet className="mb-4 h-16 w-16 opacity-20" />
              <p className="text-lg font-medium">Açık hesap yok</p>
              <p className="mt-1 text-sm">Tüm siparişlerin ödemesi alınmış.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <OpenAccountRow
                key={order.id}
                order={order}
                onCollectClick={handleCollectClick}
              />
            ))}
          </div>
        )}
      </div>

      <CollectPaymentDialog
        order={target}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCollect={handleCollect}
      />
    </main>
  );
}
