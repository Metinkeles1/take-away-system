"use client";

import { memo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import type { Order, PaymentInfo } from "@/types";
import { CollectPaymentDialog } from "@/components/orders/CollectPaymentDialog";

const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  online: "Online",
  meal_card: "Yemek Kartı",
  iban: "IBAN",
};

interface Props {
  order: Order;
  onCollect: (payment: PaymentInfo, amount: number, note?: string) => Promise<void>;
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
  const paid = order.paidAmount ?? 0;
  const remaining = Math.max(0, order.total - paid);

  const handleCollect = async (payment: PaymentInfo, amount: number, note?: string) => {
    await onCollect(payment, amount, note);
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
                  Alacak: {formatCurrency(remaining)}
                  {paid > 0 && (
                    <span className="opacity-80">
                      {" "}· {formatCurrency(paid)} ödendi
                    </span>
                  )}
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

          {/* Kısmi tahsilat geçmişi — her parçanın tutar/yöntem/notu görünsün */}
          {order.payments && order.payments.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-amber-200/60 pt-2 dark:border-amber-800/60">
              {order.payments.map((p, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-2 text-xs text-amber-800/90 dark:text-amber-200/90"
                >
                  <span className="truncate">
                    {METHOD_LABEL[p.method] ?? p.method}
                    {p.note && <span className="opacity-70"> · {p.note}</span>}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatCurrency(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}

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
