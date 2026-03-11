"use client";

import { useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useReactToPrint } from "react-to-print";
import {
  useOrderStore,
  selectSubtotal,
  selectDeliveryFee,
  selectTotal,
} from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import ThermalReceipt from "@/components/receipt/ThermalReceipt";
import { formatCurrency, formatPhone } from "@/lib/utils";
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  User,
  MapPin,
  Phone,
  CreditCard,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";

const paymentLabels: Record<string, string> = {
  cash: "💵 Nakit",
  card: "💳 Kredi / Banka Kartı",
  online: "📱 Online Ödeme",
};

export default function OrderSummary() {
  const router = useRouter();
  const { draft, setStep, setNotes, completeOrder, resetDraft } = useOrderStore();
  const subtotal = useOrderStore(selectSubtotal);
  const deliveryFee = useOrderStore(selectDeliveryFee);
  const total = useOrderStore(selectTotal);
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: "Siparis-Fis",
  });

  const handleComplete = useCallback(() => {
    const order = completeOrder();
    if (!order) {
      toast.error("Sipariş tamamlanamadı. Lütfen tüm alanları doldurun.");
      return;
    }
    toast.success(`#${order.orderNumber} numaralı sipariş alındı!`);
    resetDraft();
    router.push(`/orders/${order.id}`);
  }, [completeOrder, resetDraft, router]);

  const handleCompleteAndPrint = useCallback(() => {
    const order = completeOrder();
    if (!order) {
      toast.error("Sipariş tamamlanamadı. Lütfen tüm alanları doldurun.");
      return;
    }
    // Fiş bas sonra yönlendir
    setTimeout(() => {
      handlePrint();
    }, 100);
    toast.success(`#${order.orderNumber} numaralı sipariş alındı!`);
    setTimeout(() => {
      resetDraft();
      router.push(`/orders/${order.id}`);
    }, 500);
  }, [completeOrder, handlePrint, resetDraft, router]);

  return (
    <div className="h-full grid gap-6 lg:grid-cols-3">
      {/* Sol: Özet bilgileri */}
      <div className="lg:col-span-2 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-4 pt-px px-px pb-4">
          {/* Ürünler */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-4 w-4 text-primary" />
                Sipariş Kalemleri ({draft.items.length} ürün)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {draft.items.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
                  >
                    <div>
                      <span className="font-medium text-sm">{item.product.name}</span>
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
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Ara Toplam</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Teslimat Ücreti</span>
                  <span>
                    {deliveryFee === 0 ? (
                      <span className="text-green-600 font-medium">Ücretsiz</span>
                    ) : (
                      formatCurrency(deliveryFee)
                    )}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Genel Toplam</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Müşteri bilgisi */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-primary" />
                Müşteri Bilgileri
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="flex items-start gap-2">
                <User className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-muted-foreground text-xs">Ad Soyad</p>
                  <p className="font-medium">{draft.customer.name || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-muted-foreground text-xs">Telefon</p>
                  <p className="font-medium">
                    {draft.customer.phone ? formatPhone(draft.customer.phone) : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 sm:col-span-2">
                <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-muted-foreground text-xs">Adres</p>
                  <p className="font-medium">
                    {[
                      draft.customer.district,
                      draft.customer.address,
                      draft.customer.addressDetail,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ödeme */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4 text-primary" />
                Ödeme Bilgisi
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Yöntem</span>
                <span className="font-medium">
                  {paymentLabels[draft.payment.method ?? ""] ?? "—"}
                </span>
              </div>
              {draft.payment.method === "cash" && draft.payment.cashGiven && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Verilen Tutar</span>
                    <span>{formatCurrency(draft.payment.cashGiven)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-green-700">
                    <span>Para Üstü</span>
                    <span>
                      {formatCurrency(Math.max(0, draft.payment.cashGiven - total))}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Sipariş notu */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sipariş Notu (Opsiyonel)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Özel talep, kapı kodu, tarif vb..."
                value={draft.notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </CardContent>
          </Card>
        </div>

        {/* Butonlar — sabit alt alan */}
        <div className="flex gap-3 pt-3 shrink-0">
          <Button variant="outline" className="flex-1" onClick={() => setStep("payment")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Geri
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleComplete}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Kaydet
          </Button>
          <Button className="flex-1" onClick={handleCompleteAndPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Kaydet & Fişi Bas
          </Button>
        </div>
      </div>

      {/* Sağ: Fiş önizleme */}
      <div className="flex flex-col min-h-0">
        <Card className="flex flex-col flex-1 min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              Fiş Önizleme
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center p-3" style={{ overflow: "hidden" }}>
            <div
              style={{
                transform: "scale(0.85)",
                transformOrigin: "top center",
                width: "80mm",
                height: "calc(210mm * 0.85)",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <ThermalReceipt
                ref={receiptRef}
                draft={draft}
                total={total}
                subtotal={subtotal}
                deliveryFee={deliveryFee}
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
          Sadece Fişi Yazdır
        </Button>
      </div>
    </div>
  );
}
