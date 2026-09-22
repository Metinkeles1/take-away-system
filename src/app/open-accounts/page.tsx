"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CustomerHistoryDialog } from "@/components/customers/CustomerHistoryDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Receipt,
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
import { formatCurrency, toLocalPhone, cn, phoneKey } from "@/lib/utils";
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
import type { OpenAccountsCollectionPeriod } from "@/actions/orders";
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

type HistoryCustomer = {
  name: string;
  phone: string;
  orderCount?: number;
};

type OpenAccountCustomerGroup = {
  key: string;
  customer: {
    name: string;
    phone: string;
    address: string;
  };
  openOrders: Order[];
  totalDue: number;
  oldestCreatedAt: Date;
};

type CollectionCustomerGroup = {
  key: string;
  customer: {
    name: string;
    phone: string;
  };
  orders: Order[];
  total: number;
  lastCollectedAt: Date;
};

const COLLECTION_PERIODS: { value: OpenAccountsCollectionPeriod; label: string }[] = [
  { value: "today", label: "Bugün" },
  { value: "week", label: "7 gün" },
  { value: "month", label: "30 gün" },
  { value: "all", label: "Tümü" },
];

// Bir müşterinin tahsilat geçmişi — varsayılan kapalı, satıra tıklanınca o
// müşterinin tüm tahsilatları (bu dönem içinde) altta açılır.
const CollectionCustomerRow = memo(function CollectionCustomerRow({
  group,
}: {
  group: CollectionCustomerGroup;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300">
          {initials(group.customer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{group.customer.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {group.orders.length} tahsilat
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Son tahsilat <RelativeTime date={group.lastCollectedAt} />
          </p>
        </div>
        <span className="shrink-0 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
          {formatCurrency(group.total)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="divide-y bg-muted/20">
          {group.orders.map((order) => (
            <div key={order.id} className="flex items-center gap-3 py-2.5 pl-16 pr-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">#{order.orderNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    {METHOD_LABEL[order.payment.method] ?? order.payment.method}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <RelativeTime date={order.paidAt ?? order.updatedAt} />
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-sm">
                {formatCurrency(order.total)}
              </span>
              <Button variant="ghost" size="icon-sm" className="shrink-0" asChild>
                <Link href={`/orders/${order.id}`} prefetch={false} title="Sipariş detayı">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

const CollectionHistory = memo(function CollectionHistory({
  groups,
  orderCount,
  period,
  onPeriodChange,
}: {
  groups: CollectionCustomerGroup[];
  orderCount: number;
  period: OpenAccountsCollectionPeriod;
  onPeriodChange: (period: OpenAccountsCollectionPeriod) => void;
}) {
  const total = groups.reduce((sum, g) => sum + g.total, 0);

  return (
    <Card className="overflow-hidden border-emerald-200/80 dark:border-emerald-900/70">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b bg-emerald-50/60 px-4 py-3.5 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="font-semibold">Tahsilat Geçmişi</h2>
              <p className="text-xs text-muted-foreground">
                {groups.length} müşteri · {orderCount} tahsilat · {formatCurrency(total)}
              </p>
            </div>
          </div>

          <div className="flex w-full rounded-lg bg-background/70 p-1 ring-1 ring-emerald-200/70 dark:bg-background/30 dark:ring-emerald-900 sm:w-auto">
            {COLLECTION_PERIODS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={period === option.value ? "secondary" : "ghost"}
                className={cn(
                  "h-7 flex-1 px-2 text-xs sm:flex-none",
                  period === option.value && "bg-emerald-600 text-white hover:bg-emerald-700",
                )}
                onClick={() => onPeriodChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Bu dönemde tahsil edilmiş açık hesap bulunmuyor.
          </div>
        ) : (
          <div className="divide-y">
            {groups.map((group) => (
              <CollectionCustomerRow key={group.key} group={group} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Kart başlığındaki avatar için isim baş harfleri.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// Müşteri kartı: varsayılan kapalı — sadece özet (isim, yaş rozeti, toplam
// borç) görünür. Detaya inmek isteyen sipariş listesini genişletir; geçmiş
// simgesi tüm sipariş geçmişini ayrı bir diyalogda açar.
const CustomerOpenAccountCard = memo(function CustomerOpenAccountCard({
  group,
  onCollectClick,
  onCancel,
  onViewHistory,
}: {
  group: OpenAccountCustomerGroup;
  onCollectClick: (order: Order) => void;
  onCancel: (order: Order) => void;
  onViewHistory: (customer: HistoryCustomer) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const d = daysOpen(group.oldestCreatedAt);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {initials(group.customer.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{group.customer.name}</p>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                AGING_BADGE_CLASS[agingLevel(d)],
              )}
            >
              {d <= 0 ? "bugün açıldı" : `${agingLabel(d)}dür açık`}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {group.customer.phone && (
              <a
                href={`tel:${toLocalPhone(group.customer.phone)}`}
                className="shrink-0 text-blue-600 hover:underline"
              >
                {group.customer.phone}
              </a>
            )}
            {group.customer.phone && <span className="shrink-0">·</span>}
            <span className="truncate">{group.customer.address}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {group.openOrders.length} sipariş
          </p>
          <p className="text-lg font-bold leading-tight tabular-nums text-amber-700 dark:text-amber-300">
            {formatCurrency(group.totalDue)}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Sipariş geçmişi"
          className="shrink-0 text-muted-foreground"
          onClick={() =>
            onViewHistory({ name: group.customer.name, phone: group.customer.phone })
          }
        >
          <Receipt className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={expanded ? "Daralt" : "Siparişleri göster"}
          className="shrink-0 text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>

      {expanded && (
        <div className="divide-y border-t">
          {group.openOrders.map((order) => {
            const remaining = Math.max(0, order.total - (order.paidAmount ?? 0));
            const partialPaid = (order.paidAmount ?? 0) > 0;

            return (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">#{order.orderNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      <RelativeTime date={order.createdAt} />
                    </span>
                  </div>
                  {partialPaid && (
                    <p className="mt-0.5 text-[11px] text-amber-600 tabular-nums">
                      {formatCurrency(order.paidAmount ?? 0)} ödendi / {formatCurrency(order.total)}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="mr-1 font-semibold tabular-nums">
                    {formatCurrency(remaining)}
                  </span>
                  <Button
                    size="sm"
                    className="h-8 bg-amber-600 hover:bg-amber-700"
                    onClick={() => onCollectClick(order)}
                  >
                    Tahsil Et
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                    <Link href={`/orders/${order.id}`} prefetch={false} title="Sipariş detayı">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600"
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
                        <AlertDialogAction variant="destructive" onClick={() => onCancel(order)}>
                          İptal Et
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
});

export default function OpenAccountsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectionPeriod, setCollectionPeriod] =
    useState<OpenAccountsCollectionPeriod>("today");
  const [target, setTarget] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<HistoryCustomer | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  // İndeksli sorgu: sadece açık hesapları çeker (tüm koleksiyonu değil).
  // inFlightRef ile eşzamanlı refetch'leri (pusher + focus üst üste gelince) bir'e indirger.
  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const data = await getOpenAccounts(collectionPeriod);
      if (mountedRef.current) setOrders(data);
    } catch {
      // sessizce geç — bir sonraki tetikte tekrar denenir
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [collectionPeriod]);

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

  const groupedOpen = useMemo(() => {
    const map = new Map<string, OpenAccountCustomerGroup>();

    for (const order of sortedOpen) {
      const key = phoneKey(order.customer.phone) || `${order.customer.name}|${order.customer.address}`;
      const current = map.get(key);
      const remaining = Math.max(0, order.total - (order.paidAmount ?? 0));

      if (!current) {
        map.set(key, {
          key,
          customer: {
            name: order.customer.name,
            phone: order.customer.phone,
            address: order.customer.address,
          },
          openOrders: [order],
          totalDue: remaining,
          oldestCreatedAt: new Date(order.createdAt),
        });
        continue;
      }

      current.openOrders.push(order);
      current.totalDue += remaining;
      if (+new Date(order.createdAt) < +new Date(current.oldestCreatedAt)) {
        current.oldestCreatedAt = new Date(order.createdAt);
      }
      if (!current.customer.phone && order.customer.phone) {
        current.customer.phone = order.customer.phone;
      }
    }

    return [...map.values()].sort(
      (a, b) => +new Date(a.oldestCreatedAt) - +new Date(b.oldestCreatedAt),
    );
  }, [sortedOpen]);

  // Tahsil edilenler — en son tahsil edilen en üstte.
  const sortedCollected = useMemo(
    () =>
      [...collectedOrders].sort(
        (a, b) =>
          +new Date(b.paidAt ?? b.updatedAt) - +new Date(a.paidAt ?? a.updatedAt),
      ),
    [collectedOrders],
  );

  // Tahsilat geçmişini müşteri bazında grupla — her müşteri tek satır, en son
  // tahsilatı olan müşteri en üstte.
  const groupedCollected = useMemo(() => {
    const map = new Map<string, CollectionCustomerGroup>();

    for (const order of sortedCollected) {
      const key = phoneKey(order.customer.phone) || `${order.customer.name}|${order.id}`;
      const current = map.get(key);
      const collectedAt = new Date(order.paidAt ?? order.updatedAt);

      if (!current) {
        map.set(key, {
          key,
          customer: { name: order.customer.name, phone: order.customer.phone },
          orders: [order],
          total: order.total,
          lastCollectedAt: collectedAt,
        });
        continue;
      }

      current.orders.push(order);
      current.total += order.total;
      if (+collectedAt > +current.lastCollectedAt) {
        current.lastCollectedAt = collectedAt;
      }
    }

    return [...map.values()].sort(
      (a, b) => +b.lastCollectedAt - +a.lastCollectedAt,
    );
  }, [sortedCollected]);

  const handleCollectClick = useCallback((order: Order) => {
    setTarget(order);
    setDialogOpen(true);
  }, []);

  const handleCollectionPeriodChange = useCallback(
    (period: OpenAccountsCollectionPeriod) => {
      if (period === collectionPeriod) return;
      setLoading(true);
      setCollectionPeriod(period);
    },
    [collectionPeriod],
  );

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
            Ödemesi alınmamış {groupedOpen.length} müşteri · {openOrders.length} hesap
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
        ) : (
          <div className="space-y-3">
            {groupedOpen.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                  <Wallet className="mb-3 h-12 w-12 opacity-20" />
                  <p className="font-medium">Açık hesap yok</p>
                  <p className="mt-1 text-sm">Tüm açık hesapların tahsilatı tamamlanmış.</p>
                </CardContent>
              </Card>
            ) : (
              groupedOpen.map((group) => (
                <CustomerOpenAccountCard
                  key={group.key}
                  group={group}
                  onCollectClick={handleCollectClick}
                  onCancel={handleCancel}
                  onViewHistory={setHistoryCustomer}
                />
              ))
            )}

            <CollectionHistory
              groups={groupedCollected}
              orderCount={sortedCollected.length}
              period={collectionPeriod}
              onPeriodChange={handleCollectionPeriodChange}
            />
          </div>
        )}
      </div>

      <CollectPaymentDialog
        order={target}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCollect={handleCollect}
      />

      <CustomerHistoryDialog
        customer={historyCustomer}
        onClose={() => setHistoryCustomer(null)}
      />
    </main>
  );
}
