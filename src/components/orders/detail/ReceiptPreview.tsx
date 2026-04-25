"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import ThermalReceipt from "@/components/receipt/ThermalReceipt";
import type { Order } from "@/types";
import { forwardRef, memo } from "react";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";

interface Props {
  order: Order;
  onPrint: () => void;
}

const ReceiptPreview = memo(
  forwardRef<HTMLDivElement, Props>(function ReceiptPreview(
    { order, onPrint },
    ref
  ) {
    const receiptDraft = {
      items: order.items,
      customer: order.customer,
      payment: {
        ...order.payment,
        ibanName:
          order.payment.method === "iban" ? DEFAULT_IBAN_NAME : undefined,
        ibanNumber:
          order.payment.method === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
      },
      notes: order.notes,
      currentStep: "summary" as const,
    };

    return (
      <div className="hidden lg:flex flex-col w-72 shrink-0 pt-px pb-4">
        <Card className="flex flex-col flex-1 min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              Fiş Önizleme
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex justify-center p-3">
            <div style={{ zoom: 0.82, width: "80mm", flexShrink: 0 }}>
              <ThermalReceipt
                ref={ref}
                draft={receiptDraft}
                total={order.total}
                subtotal={order.subtotal}
                orderNumber={order.orderNumber}
              />
            </div>
          </CardContent>
        </Card>
        <Button
          variant="outline"
          className="mt-3 w-full shrink-0"
          onClick={onPrint}
        >
          <Printer className="mr-2 h-4 w-4" />
          Fişi Yazdır
        </Button>
      </div>
    );
  })
);

export default ReceiptPreview;
