"use client";

import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Printer, SlidersHorizontal } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  type ReceiptOptions,
  type ReceiptToggleKey,
  type PaymentScope,
  DEFAULT_RECEIPT_OPTIONS,
  RECEIPT_OPTION_DEFS,
  PAYMENT_SCOPE_DEFS,
} from "@/components/receipt/corporateReceiptKit";

export function PrintReceiptDialog({
  open,
  onOpenChange,
  title,
  children,
  filterable = false,
  storageKey,
  optionDefs = RECEIPT_OPTION_DEFS,
  showScope = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  // Statik içerik (tek fiş) ya da seçeneklere göre render eden fonksiyon (ekstre/ürün özeti).
  children: React.ReactNode | ((opts: ReceiptOptions) => React.ReactNode);
  filterable?: boolean;
  storageKey?: string;
  // Gösterilecek "Fişte Göster" tikleri (varsayılan: tümü).
  optionDefs?: { key: ReceiptToggleKey; label: string }[];
  // "Ödeme durumu" mod butonları gösterilsin mi (varsayılan: evet).
  showScope?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: title,
  });

  // Filtre seçimi: varsa localStorage'dan yüklenir, böylece tekrar yazdırmada korunur.
  const [opts, setOpts] = useState<ReceiptOptions>(() => {
    if (typeof window === "undefined" || !storageKey) return DEFAULT_RECEIPT_OPTIONS;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return { ...DEFAULT_RECEIPT_OPTIONS, ...JSON.parse(raw) };
    } catch {
      /* yok say */
    }
    return DEFAULT_RECEIPT_OPTIONS;
  });

  const persist = (next: ReceiptOptions) => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* yok say */
      }
    }
  };

  const toggle = (key: ReceiptToggleKey) => {
    setOpts((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      persist(next);
      return next;
    });
  };

  const setScope = (scope: PaymentScope) => {
    setOpts((prev) => {
      const next = { ...prev, scope };
      persist(next);
      return next;
    });
  };

  // Lazy mount: children'ı sadece dialog açıkken hesapla/render et.
  // Aksi halde MonthlyStatement / ProductSummaryReceipt her parent render'ında
  // tekrar inşa edilip gereksiz hesaplama yapar.
  const content = open
    ? typeof children === "function"
      ? children(opts)
      : children
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        aria-describedby={undefined}
        // Dialog'u ekrana sabitle: header/filtre/footer sabit, yalnızca fiş alanı
        // kaydırılır. Aksi halde uzun ekstrede alt kısım ekran dışında kalıyordu.
        style={{ display: "flex", flexDirection: "column", maxHeight: "90dvh" }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {filterable && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Fişte Göster
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {optionDefs.map((def) => (
                <label
                  key={def.key}
                  className="flex cursor-pointer select-none items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={opts[def.key]}
                    onCheckedChange={() => toggle(def.key)}
                  />
                  {def.label}
                </label>
              ))}
            </div>

            {showScope && (
              <div className="mt-3 border-t pt-3">
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  Ödeme durumu
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_SCOPE_DEFS.map((def) => (
                    <button
                      key={def.value}
                      type="button"
                      onClick={() => setScope(def.value)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        opts.scope === def.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:bg-muted",
                      )}
                    >
                      {def.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div
          ref={contentRef}
          className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto py-2 print:min-h-0 print:flex-none print:overflow-visible"
        >
          {content}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
          <Button onClick={() => handlePrint()}>
            <Printer className="mr-2 h-4 w-4" />
            Yazdır
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
