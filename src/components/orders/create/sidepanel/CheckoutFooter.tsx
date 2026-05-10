import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Check, Printer, Loader2 } from "lucide-react";

interface CheckoutFooterProps {
  subtotal: number;
  total: number;
  canComplete: boolean;
  isSubmitting: boolean;
  onComplete: () => void;
  onCompleteAndPrint: () => void;
}

export function CheckoutFooter({
  subtotal,
  total,
  canComplete,
  isSubmitting,
  onComplete,
  onCompleteAndPrint,
}: CheckoutFooterProps) {
  return (
    <div className="shrink-0 border-t bg-card">
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Toplam
          </span>
          <span className="text-2xl font-bold tabular-nums">{formatCurrency(total)}</span>
        </div>
        {subtotal !== total && (
          <p className="text-[11px] text-muted-foreground tabular-nums text-right">
            Ara toplam: {formatCurrency(subtotal)}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-11"
            disabled={!canComplete || isSubmitting}
            onClick={onComplete}
          >
            {isSubmitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-4 w-4" />
            )}
            {isSubmitting ? "Tamamlanıyor..." : "Tamamla"}
          </Button>
          <Button
            size="lg"
            className="flex-1 h-11"
            disabled={!canComplete || isSubmitting}
            onClick={onCompleteAndPrint}
          >
            {isSubmitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-1.5 h-4 w-4" />
            )}
            {isSubmitting ? "Yazdırılıyor..." : "Yazdır & Tamamla"}
          </Button>
        </div>
      </div>
    </div>
  );
}
