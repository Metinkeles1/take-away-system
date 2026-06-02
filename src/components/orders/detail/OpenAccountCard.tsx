"use client";

import { memo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import type { Order, PaymentInfo } from "@/types";
import { CollectPaymentDialog } from "@/components/orders/CollectPaymentDialog";

interface Props {
  order: Order;
  onCollect: (payment: PaymentInfo) => Promise<void>;
  onToggleOpen: (open: boolean) => Promise<void>;
}

const OpenAccountCard = memo(function OpenAccountCard({
  order,
  onCollect,
  onToggleOpen,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOpen = order.paymentStatus === "open";

  const handleCollect = async (payment: PaymentInfo) => {
    await onCollect(payment);
    toast.success("Tahsil edildi");
  };

  const handleRevert = async () => {
    setBusy(true);
    try {
      await onToggleOpen(false);
      toast.success("Açık hesaptan çıkarıldı");
    } finally {
      setBusy(false);
    }
  };

  // Açık hesapta değilse gövdede bir şey gösterme — "Açık Hesaba Al" header'da.
  if (!isOpen) return null;

  return (
    <>
      <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900">
                <Clock className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  Açık Hesap
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                  Alacak: {formatCurrency(order.total)}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="h-9 bg-amber-600 hover:bg-amber-700"
              onClick={() => setDialogOpen(true)}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Tahsil Et
            </Button>
          </div>

          <button
            type="button"
            onClick={handleRevert}
            disabled={busy}
            className="mt-3 text-xs text-amber-700/70 hover:text-amber-800 hover:underline disabled:opacity-50 dark:text-amber-300/70"
          >
            Açık hesaptan çıkar
          </button>
        </CardContent>
      </Card>

      <CollectPaymentDialog
        order={order}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCollect={handleCollect}
      />
    </>
  );
});

export default OpenAccountCard;
