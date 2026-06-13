"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  Phone,
  MapPin,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  daysOpen,
  agingLevel,
  agingLabel,
  AGING_BADGE_CLASS,
} from "@/lib/orders/aging";
import { RelativeTime } from "@/components/RelativeTime";
import { CollectPaymentDialog } from "@/components/orders/CollectPaymentDialog";
import { subscribeOrders } from "@/lib/pusher/client";
import {
  getOpenAccounts,
  collectOpenAccount,
  updateOrderStatus,
} from "@/actions/orders";
import type { Order, PaymentInfo } from "@/types";
import { toast } from "sonner";

// Tahsilat ödeme yöntemi etiketleri — tahsil edilmiş kayıtta yöntemi göstermek için.
const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  online: "Online",
  meal_card: "Yemek Kartı",
  iban: "IBAN",
};

// Tek satır — memoize: bir tahsilat sonrası diğer kartlar yeniden render olmasın.
const OpenAccountRow = memo(function OpenAccountRow({
  order,
  onCollectClick,
  onCancel,
}: {
  order: Order;
  onCollectClick: (order: Order) => void;
  onCancel: (order: Order) => void;
}) {
  // Tahsil edilmiş açık hesap (bugün): listeden düşmez, "Tahsil Edildi" görünür.
  const collected = order.paymentStatus === "paid";

  return (
    <Card className="overflow-hidden relative">
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          collected ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      <CardContent className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4 pl-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-lg">#{order.orderNumber}</span>
            {collected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-medium dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Tahsil Edildi
                {order.payment?.method && (
                  <span className="opacity-80">
                    · {METHOD_LABEL[order.payment.method] ?? order.payment.method}
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium dark:bg-amber-950 dark:text-amber-300">
                Açık Hesap
              </span>
            )}
            {/* Yaşlandırma — kaç gündür açık (3g+ sarı, 7g+ kırmızı). Tahsil edilende gizli. */}
            {!collected &&
              (() => {
                const d = daysOpen(order.createdAt);
                return (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      AGING_BADGE_CLASS[agingLevel(d)],
                    )}
                  >
                    {d <= 0 ? "bugün açıldı" : `${agingLabel(d)}dür açık`}
                  </span>
                );
              })()}
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
              {collected ? "Tutar" : "Kalan"}
            </span>
            <span
              className={cn(
                "text-xl font-bold leading-tight tabular-nums",
                collected && "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {formatCurrency(
                collected
                  ? order.total
                  : Math.max(0, order.total - (order.paidAmount ?? 0)),
              )}
            </span>
            {/* Kısmi ödeme yapıldıysa ne kadar ödendiğini göster */}
            {!collected && (order.paidAmount ?? 0) > 0 && (
              <span className="text-[11px] text-amber-600 tabular-nums">
                {formatCurrency(order.paidAmount ?? 0)} ödendi /{" "}
                {formatCurrency(order.total)}
              </span>
            )}
          </div>
          {collected ? (
            <Button variant="outline" size="sm" className="h-9" asChild>
              <Link href={`/orders/${order.id}`} prefetch={false}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
          <div className="flex gap-2 md:w-full">
            <Button
              size="sm"
              className="h-9 flex-1 bg-amber-600 hover:bg-amber-700"
              onClick={() => onCollectClick(order)}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Tahsil Et
            </Button>
            {/* İptal Et — sipariş iptal edilince açık hesaptan ve alacaktan düşer.
                Geri alınamaz olduğu için onay sorulur. */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  title="Siparişi iptal et"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Siparişi iptal et?</AlertDialogTitle>
                  <AlertDialogDescription>
                    #{order.orderNumber} · {order.customer.name} ·{" "}
                    {formatCurrency(order.total)} açık hesabı iptal edilecek.
                    Sipariş &quot;İptal Edildi&quot; olarak işaretlenir ve
                    alacaktan düşer. Bu işlem geri alınamaz.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => onCancel(order)}
                  >
                    İptal Et
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" size="sm" className="h-9" asChild>
              <Link href={`/orders/${order.id}`} prefetch={false}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          )}
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

  // Hâlâ ödenmemiş açık hesaplar — toplam alacak ve sayım yalnızca bunlardan.
  const openOrders = useMemo(
    () => orders.filter((o) => o.paymentStatus === "open"),
    [orders],
  );
  // Bugün tahsil edilenler — listede "Tahsil Edildi" olarak kalır.
  const collectedOrders = useMemo(
    () => orders.filter((o) => o.paymentStatus !== "open"),
    [orders],
  );

  // Toplam alacak = açık siparişlerin KALANLARI (kısmi ödenenlerde tahsil edilen düşülür).
  const totalDue = useMemo(
    () =>
      openOrders.reduce(
        (sum, o) => sum + Math.max(0, o.total - (o.paidAmount ?? 0)),
        0,
      ),
    [openOrders],
  );

  // En eski borç en üstte — yaşlanmış alacaklar öne çıksın.
  const sortedOpen = useMemo(
    () =>
      [...openOrders].sort(
        (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
      ),
    [openOrders],
  );

  // Tahsil edilenler — en son tahsil edilen en üstte.
  const sortedCollected = useMemo(
    () =>
      [...collectedOrders].sort(
        (a, b) =>
          +new Date(b.paidAt ?? b.updatedAt) - +new Date(a.paidAt ?? a.updatedAt),
      ),
    [collectedOrders],
  );

  const handleCollectClick = useCallback((order: Order) => {
    setTarget(order);
    setDialogOpen(true);
  }, []);

  const handleCancel = useCallback(
    async (order: Order) => {
      // Optimistic: iptal edilen sipariş listeden anında düşer.
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      const res = await updateOrderStatus(order.id, "cancelled");
      if (!res.ok) {
        toast.error(res.error ?? "Sipariş iptal edilemedi");
        void load(); // geri al — taze listeyi çek
        return;
      }
      toast.success(`#${order.orderNumber} iptal edildi`);
    },
    [load],
  );

  const handleCollect = useCallback(
    async (payment: PaymentInfo, amount: number, note?: string) => {
      if (!target) return;
      const { id, orderNumber } = target;
      // Optimistic: kısmi olabilir. Kalanın tamamı tahsil edilirse "Tahsil Edildi"
      // olarak görünür; değilse açık hesapta kalan tutarla kalır.
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          const already = o.paidAmount ?? 0;
          const newPaid = already + amount;
          const fullyPaid = newPaid >= o.total - 0.001;
          return {
            ...o,
            payments: [
              ...(o.payments ?? []),
              { amount, method: payment.method, mealCardBrand: payment.mealCardBrand, at: new Date(), note: note?.trim() || undefined },
            ],
            paidAmount: newPaid,
            ...(fullyPaid
              ? { paymentStatus: "paid" as const, payment, paidAt: new Date() }
              : {}),
          };
        }),
      );
      const res = await collectOpenAccount(id, payment, amount, note);
      if (!res.ok) {
        toast.error(res.error ?? "Tahsilat başarısız");
        void load(); // geri al — taze listeyi çek
        return;
      }
      toast.success(`#${orderNumber} tahsilat işlendi`);
    },
    [target, load],
  );

  return (
    <main className="h-full flex flex-col px-3 pt-3 pb-6 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 lg:pb-8 overflow-hidden">
      <div className="mb-3 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Açık Hesaplar</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
            Ödemesi alınmamış {openOrders.length} sipariş
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
            {sortedOpen.map((order) => (
              <OpenAccountRow
                key={order.id}
                order={order}
                onCollectClick={handleCollectClick}
                onCancel={handleCancel}
              />
            ))}

            {/* Bugün tahsil edilenler — listeden düşmez, ayrı başlık altında. */}
            {sortedCollected.length > 0 && (
              <div className="pt-2">
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Bugün Tahsil Edilenler ({sortedCollected.length})
                </p>
                <div className="space-y-3">
                  {sortedCollected.map((order) => (
                    <OpenAccountRow
                      key={order.id}
                      order={order}
                      onCollectClick={handleCollectClick}
                      onCancel={handleCancel}
                    />
                  ))}
                </div>
              </div>
            )}
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
