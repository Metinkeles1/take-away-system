import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Order, type OrderStatus } from "@/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { RelativeTime } from "@/components/RelativeTime";
import { ORDER_STATUS_CONFIG, ORDER_STATUS_ORDER } from "@/lib/orderStatus";
import {
  Phone,
  MapPin,
  Timer,
  ChevronRight,
  Loader2,
  Store,
} from "lucide-react";

const SOURCE_BADGE: Record<
  NonNullable<Order["source"]>,
  { label: string; className: string } | null
> = {
  manual: null,
  trendyol: {
    label: "Trendyol",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  getir: {
    label: "Getir",
    className: "bg-purple-100 text-purple-700 border-purple-200",
  },
  yemeksepeti: {
    label: "Yemeksepeti",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

interface OrderListCardProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
}

export function OrderListCard({ order, onStatusChange }: OrderListCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);

  const config = ORDER_STATUS_CONFIG[order.status];
  const Icon = config.icon;
  const isNavigating = isPending && navigating;
  const sourceBadge = order.source ? SOURCE_BADGE[order.source] : null;
  const isTrendyol = order.source === "trendyol";

  return (
    <Card
      className={cn(
        "transition-all hover:shadow-md hover:border-foreground/20 overflow-hidden relative",
        isTrendyol &&
          "bg-linear-to-r from-emerald-50/70 via-white to-white border-emerald-200/80",
      )}
    >
      {/* Sol kenar şeridi — Trendyol için kalın yeşil, diğerleri için status rengi */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0",
          isTrendyol ? "w-1.5 bg-emerald-600" : "w-1",
          !isTrendyol && config.accent,
        )}
      />

      {/* Sağ üst köşe: Trendyol "T" rozeti */}
      {isTrendyol && (
        <div
          className="absolute top-0 right-0 z-10 flex items-center gap-1.5 rounded-bl-xl bg-emerald-600 px-2.5 py-1 text-white shadow-sm"
          title="Trendyol GO siparişi"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-black text-emerald-700">
            T
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider">
            Trendyol
          </span>
        </div>
      )}

      <CardContent className="flex flex-col md:flex-row md:items-stretch gap-3 md:gap-4 p-4 pl-5">
        {/* Sol: sipariş + müşteri */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-bold text-lg">#{order.orderNumber}</span>
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}
            >
              <Icon className="h-3 w-3" />
              {config.label}
            </span>
            {sourceBadge && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${sourceBadge.className}`}
              >
                <Store className="h-3 w-3" />
                {sourceBadge.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              <Timer className="h-3 w-3" />
              <RelativeTime date={order.createdAt} />
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">{order.customer.name}</p>
            {order.customer.phone && (
              <a
                href={`tel:${order.customer.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
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

        {/* Orta: ürünler — md+ */}
        <div className="hidden md:flex md:w-64 lg:w-80 flex-col border-l pl-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            {order.items.length} kalem ·{" "}
            {order.items.reduce((s, i) => s + i.quantity, 0)} adet
          </p>
          <div className="space-y-1 overflow-hidden">
            {order.items.slice(0, 4).map((item, idx) => (
              <div
                key={`${order.id}-item-${idx}`}
                className="flex items-center gap-2 text-sm"
              >
                <span className="inline-flex items-center justify-center min-w-[24px] h-5 rounded-md bg-muted text-[11px] font-bold px-1">
                  {item.quantity}x
                </span>
                <span className="truncate">{item.product.name}</span>
              </div>
            ))}
            {order.items.length > 4 && (
              <p className="text-xs text-muted-foreground pl-7">
                +{order.items.length - 4} ürün daha
              </p>
            )}
          </div>
        </div>

        {/* Mobilde ürün özeti */}
        <div className="md:hidden flex flex-wrap gap-1">
          {order.items.slice(0, 3).map((item, idx) => (
            <Badge
              key={`${order.id}-mitem-${idx}`}
              variant="secondary"
              className="text-xs"
            >
              {item.quantity}x {item.product.name}
            </Badge>
          ))}
          {order.items.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{order.items.length - 3}
            </Badge>
          )}
        </div>

        {/* Sağ: tutar + aksiyon */}
        <div className="flex md:flex-col items-end justify-between md:justify-center gap-2 md:gap-2 md:border-l md:pl-4 md:min-w-[180px]">
          <div className="flex flex-col md:items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Toplam
            </span>
            <span className="text-xl font-bold leading-tight">
              {formatCurrency(order.total)}
            </span>
          </div>
          <div className="flex flex-col gap-2 md:w-full">
            <Select
              value={order.status}
              onValueChange={(val) => onStatusChange(order.id, val as OrderStatus)}
            >
              <SelectTrigger className="h-8 w-36 md:w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUS_ORDER.map((s) => {
                  const c = ORDER_STATUS_CONFIG[s];
                  const SIcon = c.icon;
                  return (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <SIcon className="h-3 w-3" />
                        {c.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs md:w-full"
              disabled={isNavigating}
              onClick={() => {
                setNavigating(true);
                startTransition(() => {
                  router.push(`/orders/${order.id}`);
                });
              }}
            >
              {isNavigating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  Detay
                  <ChevronRight className="ml-1 h-3 w-3" />
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
