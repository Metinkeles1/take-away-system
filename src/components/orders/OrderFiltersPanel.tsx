import { memo, type ReactNode } from "react";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Order, type OrderStatus, type PaymentMethod } from "@/types";
import { type OrdersPeriod } from "@/actions/orders";
import { ORDER_STATUS_CONFIG } from "@/lib/orderStatus";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type OrderFilter = "all" | OrderStatus;
export type ChannelFilter = "all" | "own" | "trendyol";
// "open" = açık hesap (ödeme yönteminden bağımsız, paymentStatus'a bakar).
export type PaymentFilter = "all" | PaymentMethod | "open";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Nakit",
  card: "Kart",
  meal_card: "Yemek Kartı",
  online: "Online",
  iban: "IBAN",
};

export function matchesPayment(o: Order, filter: PaymentFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return o.paymentStatus === "open";
  return o.payment.method === filter;
}

const PERIOD_TABS: { key: OrdersPeriod; label: string }[] = [
  { key: "today", label: "Bugün" },
  { key: "week", label: "Hafta" },
  { key: "month", label: "Ay" },
  { key: "all", label: "Tümü" },
];
const CHANNEL_TABS: { key: ChannelFilter; label: string }[] = [
  { key: "all", label: "Hepsi" },
  { key: "own", label: "Kendi" },
  { key: "trendyol", label: "Trendyol" },
];
const STATUS_TABS: { key: OrderFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Beklemede" },
  { key: "preparing", label: "Hazırlanıyor" },
  { key: "on-the-way", label: "Yolda" },
  { key: "delivered", label: "Teslim" },
  { key: "cancelled", label: "İptal" },
];
const PAYMENT_TABS: { key: PaymentFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "cash", label: PAYMENT_LABEL.cash },
  { key: "card", label: PAYMENT_LABEL.card },
  { key: "meal_card", label: PAYMENT_LABEL.meal_card },
  { key: "online", label: PAYMENT_LABEL.online },
  { key: "iban", label: PAYMENT_LABEL.iban },
  { key: "open", label: "Açık Hesap" },
];

// iOS tarzı segment kontrol — az seçenekli, tek seçimli alanlar (dönem/kanal).
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-md px-2 py-1.5 text-xs font-medium transition-all",
            value === o.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Liste satırı — çok seçenekli alanlar (durum/ödeme); sayı sağda, seçili ✓.
function OptionRow({
  active,
  label,
  count,
  dot,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        active ? "bg-foreground/6 font-medium text-foreground" : "text-foreground/80 hover:bg-muted",
      )}
    >
      {active ? (
        <Check className="h-3.5 w-3.5 shrink-0" />
      ) : dot ? (
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        </span>
      ) : (
        <span className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

interface OrderFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: OrdersPeriod;
  channel: ChannelFilter;
  status: OrderFilter;
  payment: PaymentFilter;
  statusCounts: Record<OrderFilter, number>;
  paymentCounts: Record<PaymentFilter, number>;
  resultCount: number;
  onPeriodChange: (p: OrdersPeriod) => void;
  onChannelChange: (c: ChannelFilter) => void;
  onStatusChange: (s: OrderFilter) => void;
  onPaymentChange: (p: PaymentFilter) => void;
  onReset: () => void;
}

export function countActiveFilters(c: ChannelFilter, s: OrderFilter, p: PaymentFilter) {
  return (c !== "all" ? 1 : 0) + (s !== "all" ? 1 : 0) + (p !== "all" ? 1 : 0);
}

// "Filtrele" tuşu + açılır filtre menüsü. memo + stabil handler'lar: arama
// yazılırken yeniden render olmaz.
function OrderFiltersImpl({
  open,
  onOpenChange,
  period,
  channel,
  status,
  payment,
  statusCounts,
  paymentCounts,
  resultCount,
  onPeriodChange,
  onChannelChange,
  onStatusChange,
  onPaymentChange,
  onReset,
}: OrderFiltersProps) {
  const activeCount = countActiveFilters(channel, status, payment);
  // Sıfır sayılı ödeme yöntemleri gizlenir (seçili olan hariç).
  const paymentTabs = PAYMENT_TABS.filter(
    (t) => t.key === "all" || t.key === payment || paymentCounts[t.key] > 0,
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
            open || activeCount > 0
              ? "border-foreground/30 bg-foreground/5 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filtrele</span>
          {activeCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold text-background">
              {activeCount}
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0 shadow-lg"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Filtreler</p>
          <button
            type="button"
            onClick={onReset}
            disabled={activeCount === 0}
            className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Sıfırla
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-3">
          <div className="grid gap-3">
            <div>
              <Label>Dönem</Label>
              <Segmented options={PERIOD_TABS} value={period} onChange={onPeriodChange} />
            </div>
            <div>
              <Label>Kanal</Label>
              <Segmented options={CHANNEL_TABS} value={channel} onChange={onChannelChange} />
            </div>
          </div>

          <div>
            <Label>Durum</Label>
            <div className="grid grid-cols-2 gap-0.5">
              {STATUS_TABS.map((t) => (
                <OptionRow
                  key={t.key}
                  active={status === t.key}
                  label={t.label}
                  count={statusCounts[t.key]}
                  dot={t.key !== "all" ? ORDER_STATUS_CONFIG[t.key as OrderStatus].accent : undefined}
                  onClick={() => onStatusChange(t.key)}
                />
              ))}
            </div>
          </div>

          <div>
            <Label>Ödeme</Label>
            <div className="grid grid-cols-2 gap-0.5">
              {paymentTabs.map((t) => (
                <OptionRow
                  key={t.key}
                  active={payment === t.key}
                  label={t.label}
                  count={paymentCounts[t.key]}
                  onClick={() => onPaymentChange(t.key)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="border-t p-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 w-full rounded-md bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {resultCount} siparişi göster
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const OrderFilters = memo(OrderFiltersImpl);

interface OrderActiveFiltersProps {
  channel: ChannelFilter;
  status: OrderFilter;
  payment: PaymentFilter;
  onChannelChange: (c: ChannelFilter) => void;
  onStatusChange: (s: OrderFilter) => void;
  onPaymentChange: (p: PaymentFilter) => void;
  onReset: () => void;
}

// Menü kapalıyken seçili filtreler: tek tıkla kaldırılabilir etiketler.
// Dönem başlıkta yazdığı için burada gösterilmez.
function OrderActiveFiltersImpl({
  channel,
  status,
  payment,
  onChannelChange,
  onStatusChange,
  onPaymentChange,
  onReset,
}: OrderActiveFiltersProps) {
  const active: { key: string; group: string; label: string; clear: () => void }[] = [];
  if (channel !== "all")
    active.push({
      key: "channel",
      group: "Kanal",
      label: CHANNEL_TABS.find((t) => t.key === channel)!.label,
      clear: () => onChannelChange("all"),
    });
  if (status !== "all")
    active.push({
      key: "status",
      group: "Durum",
      label: STATUS_TABS.find((t) => t.key === status)!.label,
      clear: () => onStatusChange("all"),
    });
  if (payment !== "all")
    active.push({
      key: "payment",
      group: "Ödeme",
      label: PAYMENT_TABS.find((t) => t.key === payment)!.label,
      clear: () => onPaymentChange("all"),
    });
  if (active.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 shrink-0">
      {active.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={f.clear}
          className="group inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs shadow-xs hover:border-foreground/30"
        >
          <span className="text-muted-foreground">{f.group}:</span>
          <span className="font-medium">{f.label}</span>
          <X className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
        </button>
      ))}
      {active.length > 1 && (
        <button
          type="button"
          onClick={onReset}
          className="px-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Tümünü temizle
        </button>
      )}
    </div>
  );
}

export const OrderActiveFilters = memo(OrderActiveFiltersImpl);
