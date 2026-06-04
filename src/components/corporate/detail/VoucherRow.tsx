import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  Coins,
  MoreVertical,
  RotateCcw,
} from "lucide-react";

interface VoucherRowProps {
  voucher: Voucher;
  onTogglePaid: (v: Voucher) => void;
  onDelete: (v: Voucher) => void;
  onPrint: (v: Voucher) => void;
  onEdit: (v: Voucher) => void;
  onEditPayment: (v: Voucher) => void;
  // Bulk mode aktifse satır başına checkbox çıkar
  bulkMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (v: Voucher) => void;
}

export const VoucherRow = memo(function VoucherRow({
  voucher,
  onTogglePaid,
  onDelete,
  onPrint,
  onEdit,
  onEditPayment,
  bulkMode,
  selected,
  onToggleSelect,
}: VoucherRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false);

  const closeAndRun = (fn: (v: Voucher) => void) => {
    setActionsOpen(false);
    fn(voucher);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
        voucher.paid && "opacity-70",
        selected && "border-cyan-500/60 bg-cyan-500/5",
      )}
    >
      {bulkMode && (
        <label className="shrink-0 flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect?.(voucher)}
            className="size-4 rounded border-input accent-cyan-600 cursor-pointer"
            aria-label={`#${voucher.voucherNumber} seç`}
          />
        </label>
      )}
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
          ) : voucher.paidAmount > 0 ? (
            <Badge
              variant="outline"
              className="border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400"
            >
              Kısmi · {formatCurrency(voucher.paidAmount)}
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
        {voucher.billingType === "per_item" && (voucher.items ?? []).length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {(voucher.items ?? []).map((it, idx) => (
              <li
                key={`${it.productId}-${idx}`}
                className="text-xs text-muted-foreground flex items-baseline gap-2"
              >
                <span className="font-medium text-foreground tabular-nums shrink-0">
                  {it.quantity}×
                </span>
                <span className="min-w-0 truncate">
                  {it.name}
                  {it.portionLabel ? ` (${it.portionLabel})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-right shrink-0">
        <p className="text-base font-bold tabular-nums">{formatCurrency(voucher.total)}</p>
        {!voucher.paid && voucher.paidAmount > 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 tabular-nums">
            Kalan {formatCurrency(voucher.total - voucher.paidAmount)}
          </p>
        )}
      </div>

      {/* Desktop ikon grubu (5 buton) — mobilde tamamen gizli */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
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
          className="h-8 w-8 text-cyan-600 hover:text-cyan-700"
          onClick={() => onEditPayment(voucher)}
          title="Tahsilatı düzenle"
        >
          <Coins className="h-4 w-4" />
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

      {/* Mobil: tek "..." butonu — sheet'i açar */}
      <div className="sm:hidden shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setActionsOpen(true)}
          aria-label="Fiş aksiyonları"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>

      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-6">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-base">
              Fiş #{voucher.voucherNumber}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {formatDateShort(voucher.date)} · {formatCurrency(voucher.total)}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 grid gap-1">
            <SheetActionButton
              icon={<Printer className="h-4 w-4" />}
              label="Yazdır"
              onClick={() => closeAndRun(onPrint)}
            />
            <SheetActionButton
              icon={<Pencil className="h-4 w-4" />}
              label="Düzenle"
              onClick={() => closeAndRun(onEdit)}
              disabled={voucher.paid}
              hint={voucher.paid ? "Tahsil edilmiş fiş düzenlenemez" : undefined}
            />
            <SheetActionButton
              icon={<Coins className="h-4 w-4 text-cyan-600" />}
              label="Tahsilatı düzenle"
              onClick={() => closeAndRun(onEditPayment)}
            />
            <SheetActionButton
              icon={
                voucher.paid ? (
                  <RotateCcw className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Check className="h-4 w-4 text-emerald-600" />
                )
              }
              label={voucher.paid ? "Tahsilatı geri al" : "Tahsil edildi işaretle"}
              onClick={() => closeAndRun(onTogglePaid)}
            />
            <SheetActionButton
              icon={<Trash2 className="h-4 w-4 text-destructive" />}
              label="Sil"
              tone="destructive"
              onClick={() => closeAndRun(onDelete)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
});

function SheetActionButton({
  icon,
  label,
  onClick,
  disabled,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
  tone?: "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 px-3 py-3 rounded-lg text-left",
        "hover:bg-accent active:bg-accent transition-colors",
        "disabled:opacity-40 disabled:pointer-events-none",
        tone === "destructive" && "text-destructive hover:bg-destructive/10",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {hint && (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      )}
    </button>
  );
}
