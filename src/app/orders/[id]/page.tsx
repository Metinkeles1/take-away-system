"use client";

import { useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrderStore } from "@/store/orderStore";
import { useReactToPrint } from "react-to-print";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ThermalReceipt from "@/components/receipt/ThermalReceipt";
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils";
import {
  ArrowLeft,
  Printer,
  Clock,
  ClipboardList,
  CheckCircle2,
  Bike,
  XCircle,
  User,
  Phone,
  MapPin,
} from "lucide-react";
import { type OrderStatus } from "@/types";
import { toast } from "sonner";

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: "Beklemede",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    icon: Clock,
  },
  preparing: {
    label: "Hazırlanıyor",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    icon: ClipboardList,
  },
  "on-the-way": {
    label: "Yolda",
    color: "bg-purple-100 text-purple-800 border-purple-300",
    icon: Bike,
  },
  delivered: {
    label: "Teslim Edildi",
    color: "bg-green-100 text-green-800 border-green-300",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "İptal Edildi",
    color: "bg-red-100 text-red-800 border-red-300",
    icon: XCircle,
  },
};

const statusOrder: OrderStatus[] = [
  "pending",
  "preparing",
  "on-the-way",
  "delivered",
  "cancelled",
];

const paymentLabels: Record<string, string> = {
  cash: "💵 Nakit",
  card: "💳 Kredi / Banka Kartı",
  online: "📱 Online Ödeme",
};

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getOrderById, updateOrderStatus } = useOrderStore();
  const receiptRef = useRef<HTMLDivElement>(null);

  const order = getOrderById(params.id as string);

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Siparis-${order?.orderNumber}`,
  });

  if (!order) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-16 text-center">
        <p className="text-muted-foreground text-lg">Sipariş bulunamadı.</p>
        <Button className="mt-4" onClick={() => router.push("/orders")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Siparişlere Dön
        </Button>
      </main>
    );
  }

  const config = statusConfig[order.status];
  const Icon = config.icon;

  // ThermalReceipt için draft benzeri obje oluştur
  const receiptDraft = {
    items: order.items,
    customer: order.customer,
    payment: order.payment,
    notes: order.notes,
    currentStep: "summary" as const,
  };

  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-6 pb-4">
      {/* Başlık */}
      <div className="mb-4 flex items-center gap-4 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Geri
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Sipariş #{order.orderNumber}</h1>
            <span
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${config.color}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {config.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDate(order.createdAt)}
          </p>
        </div>
        <Button variant="outline" onClick={() => handlePrint()}>
          <Printer className="mr-2 h-4 w-4" />
          Fişi Yazdır
        </Button>
      </div>

      {/* İki sütun: Sol scroll, Sağ fiş sabit */}
      <div className="flex-1 min-h-0 flex gap-6">
        {/* Sol: Detay kartları */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide pt-px px-px pb-4 space-y-4">
          {/* Durum güncelle */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sipariş Durumu</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={order.status}
                onValueChange={(val) => {
                  updateOrderStatus(order.id, val as OrderStatus);
                  toast.success("Durum güncellendi");
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOrder.map((s) => {
                    const c = statusConfig[s];
                    const SIcon = c.icon;
                    return (
                      <SelectItem key={s} value={s}>
                        <span className="flex items-center gap-2">
                          <SIcon className="h-4 w-4" />
                          {c.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Ürünler */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sipariş Kalemleri</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {order.items.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-sm">{item.product.name}</p>
                      {item.note && (
                        <p className="text-xs text-muted-foreground">Not: {item.note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {item.quantity} × {formatCurrency(item.product.price)}
                      </span>
                      <span className="font-bold w-20 text-right">
                        {formatCurrency(item.totalPrice)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <Separator className="my-3" />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Ara Toplam</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Teslimat</span>
                  <span>
                    {order.deliveryFee === 0 ? (
                      <span className="text-green-600">Ücretsiz</span>
                    ) : (
                      formatCurrency(order.deliveryFee)
                    )}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Toplam</span>
                  <span className="text-primary">{formatCurrency(order.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Müşteri */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Müşteri Bilgileri</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="flex items-start gap-2">
                <User className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Ad Soyad</p>
                  <p className="font-medium">{order.customer.name}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Telefon</p>
                  <p className="font-medium">{formatPhone(order.customer.phone)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 sm:col-span-2">
                <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Adres</p>
                  <p className="font-medium">
                    {[
                      order.customer.district,
                      order.customer.address,
                      order.customer.addressDetail,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ödeme */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ödeme</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Yöntem</span>
                <span className="font-medium">
                  {paymentLabels[order.payment.method] ?? "—"}
                </span>
              </div>
              {order.payment.method === "cash" && order.payment.cashGiven && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Verilen</span>
                    <span>{formatCurrency(order.payment.cashGiven)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-green-700">
                    <span>Para Üstü</span>
                    <span>{formatCurrency(order.payment.change ?? 0)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Not */}
          {order.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sipariş Notu</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sağ: Fiş önizleme — sabit, tam yükseklik */}
        <div className="hidden lg:flex flex-col w-72 shrink-0 pt-px pb-4">
          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="h-4 w-4 text-primary" />
                Fiş Önizleme
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex justify-center p-3">
              <div
                style={{
                  transform: "scale(0.82)",
                  transformOrigin: "top center",
                  width: "80mm",
                  flexShrink: 0,
                }}
              >
                <ThermalReceipt
                  ref={receiptRef}
                  draft={receiptDraft}
                  total={order.total}
                  subtotal={order.subtotal}
                  deliveryFee={order.deliveryFee}
                  orderNumber={order.orderNumber}
                />
              </div>
            </CardContent>
          </Card>
          <Button
            variant="outline"
            className="mt-3 w-full shrink-0"
            onClick={() => handlePrint()}
          >
            <Printer className="mr-2 h-4 w-4" />
            Fişi Yazdır
          </Button>
        </div>
      </div>
    </main>
  );
}
