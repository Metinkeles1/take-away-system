import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { formatDateShort } from "@/lib/period";
import { type Voucher } from "@/types";
import {
  Receipt,
  Printer,
  Pencil,
  Check,
  Trash2,
  CheckCircle2,
} from "lucide-react";

interface VoucherRowProps {
  voucher: Voucher;
  onTogglePaid: (v: Voucher) => void;
  onDelete: (v: Voucher) => void;
  onPrint: (v: Voucher) => void;
  onEdit: (v: Voucher) => void;
}

export const VoucherRow = memo(function VoucherRow({
  voucher,
  onTogglePaid,
  onDelete,
  onPrint,
  onEdit,
}: VoucherRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
        voucher.paid && "opacity-70",
      )}
    >
      <div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
        <Receipt className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">#{voucher.voucherNumber}</span>
          <span className="text-sm text-muted-foreground">
            {formatDateShort(voucher.date)}
          </span>
          {voucher.paid ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1"
            >
              <CheckCircle2 className="h-3 w-3" />
              Tahsil edildi
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              Açık
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
          <span>
            {voucher.billingType === "per_person"
              ? `${voucher.personCount ?? 0} kişi × ${formatCurrency(voucher.pricePerPerson ?? 0)}`
              : `${(voucher.items ?? []).reduce((s, it) => s + it.quantity, 0)} ürün`}
          </span>
          {voucher.note && <span className="truncate">· {voucher.note}</span>}
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className="text-base font-bold tabular-nums">{formatCurrency(voucher.total)}</p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => onPrint(voucher)}
          title="Yazdır"
        >
          <Printer className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-40"
          onClick={() => onEdit(voucher)}
          disabled={voucher.paid}
          title={voucher.paid ? "Tahsil edilmiş fiş düzenlenemez" : "Düzenle"}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            voucher.paid
              ? "text-muted-foreground"
              : "text-emerald-600 hover:text-emerald-700",
          )}
          onClick={() => onTogglePaid(voucher)}
          title={voucher.paid ? "Tahsilatı geri al" : "Tahsil edildi olarak işaretle"}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(voucher)}
          title="Sil"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
