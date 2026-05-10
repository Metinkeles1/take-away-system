import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { type Corporate, type Product, type PortionOption } from "@/types";
import {
  Building2,
  Plus,
  Minus,
  ShoppingCart,
  Trash2,
  Loader2,
  Receipt,
} from "lucide-react";

export interface VoucherDraftItem {
  product: Product;
  portion?: PortionOption;
  quantity: number;
}

export function calcUnitPrice(product: Product, portion?: PortionOption): number {
  return portion
    ? Math.round(product.price * portion.multiplier * 100) / 100
    : product.price;
}

interface VoucherCartProps {
  corporate: Corporate;
  date: string;
  setDate: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  items: Map<string, VoucherDraftItem>;
  totalQty: number;
  total: number;
  isSaving: boolean;
  isEdit: boolean;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onRemove: (key: string) => void;
  onSubmit: () => void;
}

export function VoucherCart({
  corporate,
  date,
  setDate,
  note,
  setNote,
  items,
  totalQty,
  total,
  isSaving,
  isEdit,
  onIncrement,
  onDecrement,
  onRemove,
  onSubmit,
}: VoucherCartProps) {
  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header: corporate + date */}
      <div className="shrink-0 px-4 py-3 border-b">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Building2 className="h-3.5 w-3.5" />
          <span className="truncate">{corporate.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Label htmlFor="date" className="text-xs shrink-0">
            Tarih
          </Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Cart */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {items.size === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm py-8">
            <ShoppingCart className="h-10 w-10 opacity-30 mb-2" />
            <p>Sepet boş</p>
            <p className="text-xs mt-1">Ürün eklemek için soldan tıkla</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {Array.from(items.entries()).map(([key, it]) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-tight">
                    {it.product.name}
                    {it.portion && (
                      <span className="text-xs text-muted-foreground font-normal">
                        {" "}
                        ({it.portion.label})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(calcUnitPrice(it.product, it.portion))} × {it.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-6 w-6 rounded-full"
                    onClick={() => onDecrement(key)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-semibold w-5 text-center tabular-nums">
                    {it.quantity}
                  </span>
                  <Button
                    size="icon"
                    variant="default"
                    className="h-6 w-6 rounded-full"
                    onClick={() => onIncrement(key)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <span className="text-sm font-bold tabular-nums w-16 text-right">
                  {formatCurrency(calcUnitPrice(it.product, it.portion) * it.quantity)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => onRemove(key)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Note */}
      <div className="shrink-0 px-3 pt-2 pb-1 border-t">
        <Label htmlFor="note" className="text-xs">
          Not (isteğe bağlı)
        </Label>
        <Textarea
          id="note"
          rows={1}
          placeholder="Açıklama..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 text-sm resize-none"
        />
      </div>

      {/* Total + Submit */}
      <div className="shrink-0 border-t bg-muted/30 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {totalQty > 0 ? `${totalQty} ürün` : "—"}
          </span>
          <span className="text-xl font-bold tabular-nums">{formatCurrency(total)}</span>
        </div>
        <Button
          className="w-full h-11"
          disabled={isSaving || items.size === 0}
          onClick={onSubmit}
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Receipt className="mr-2 h-4 w-4" />
          )}
          {isEdit ? "Kaydet" : "Fiş Oluştur"}
        </Button>
      </div>
    </div>
  );
}
