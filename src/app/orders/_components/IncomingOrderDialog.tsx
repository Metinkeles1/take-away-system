"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";
import { Printer, CheckCircle2, XCircle, Store } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ThermalReceipt from "@/components/receipt/ThermalReceipt";
import { orderToReceiptDraft } from "@/lib/orderToReceiptDraft";
import { useOrderStore } from "@/store/orderStore";
import { formatCurrency } from "@/lib/utils";
import { type Order } from "@/types";

interface Props {
  order: Order | null;
  onClose: () => void;
}

const SOURCE_LABEL: Record<NonNullable<Order["source"]>, string> = {
  manual: "Manuel",
  trendyol: "Trendyol",
  getir: "Getir",
  yemeksepeti: "Yemeksepeti",
};

export function IncomingOrderDialog({ order, onClose }: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: order ? `Siparis-${order.orderNumber}` : "Siparis",
  });

  const handleAccept = useCallback(async () => {
    if (!order) return;
    await updateOrderStatus(order.id, "preparing");
    toast.success(`#${order.orderNumber} kabul edildi — hazırlanıyor`);
    onClose();
  }, [order, updateOrderStatus, onClose]);

  const handleReject = useCallback(async () => {
    if (!order) return;
    await updateOrderStatus(order.id, "cancelled");
    toast.message(`#${order.orderNumber} reddedildi`);
    onClose();
  }, [order, updateOrderStatus, onClose]);

  const handlePrintAndAccept = useCallback(() => {
    handlePrint();
    // print dialog'u açıldıktan sonra kabul et — kullanıcı print'i iptal etse de sipariş kabul olur
    void handleAccept();
  }, [handlePrint, handleAccept]);

  // Trendyol siparişleri server'da OTOMATİK kabul ediliyor.
  // Burada sadece fişi otomatik yazdırıp dialog'u kapatıyoruz —
  // operatörün ekstra tıklamasına gerek yok.
  const autoHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!order) return;
    if (order.source !== "trendyol") return;
    if (autoHandled.current === order.id) return;
    autoHandled.current = order.id;

    // Fiş içeriğinin render olması için bir tick bekle
    const t = setTimeout(() => {
      handlePrint();
      toast.success(`#${order.orderNumber} Trendyol siparişi otomatik kabul edildi`);
      onClose();
    }, 300);
    return () => clearTimeout(t);
  }, [order, handlePrint, onClose]);

  if (!order) return null;

  const sourceLabel = order.source ? SOURCE_LABEL[order.source] : "Yeni";
  const isTrendyol = order.source === "trendyol";
  const draft = orderToReceiptDraft(order);

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-orange-600" />
            Yeni {sourceLabel} Siparişi
            {isTrendyol && (
              <span className="ml-auto text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                Otomatik kabul edildi
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            #{order.orderNumber} · {order.customer.name} ·{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(order.total)}
            </span>
            {isTrendyol && (
              <span className="block mt-1 text-xs text-gray-500">
                Fiş otomatik yazdırılıyor… Sipariş hazırlanıyor durumunda kuyrukta.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/30 p-3 flex justify-center">
          <div style={{ zoom: 0.85 }}>
            <ThermalReceipt
              ref={receiptRef}
              draft={draft}
              total={order.total}
              subtotal={order.subtotal}
              orderNumber={order.orderNumber}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button
            variant="ghost"
            onClick={handleReject}
            className="text-destructive hover:text-destructive"
          >
            <XCircle className="mr-1.5 h-4 w-4" />
            Reddet
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handlePrint()}>
              <Printer className="mr-1.5 h-4 w-4" />
              Sadece Yazdır
            </Button>
            <Button onClick={handlePrintAndAccept}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Kabul Et &amp; Yazdır
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
