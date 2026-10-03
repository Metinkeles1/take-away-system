import { memo, useState, type ReactNode } from "react";
import { CalendarDays, Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { tr } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { type Order, type OrderStatus, type PaymentMethod } from "@/types";
import { type OrdersPeriod } from "@/actions/orders";
import { ORDER_STATUS_CONFIG } from "@/lib/orderStatus";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type OrderFilter = "all" | OrderStatus;
export type ChannelFilter = "all" | "own" | "trendyol";
// "open" = açık hesap (ödeme yönteminden bağımsız, paymentStatus'a bakar).
export type PaymentFilter = "all" | PaymentMethod | "open";

// Takvimden seçilen gün aralığı (iki uç dahil, yerel gün).
export interface OrderDateRange {
  from: Date;
  to: Date;
}

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Aralığın [başlangıç, bitiş) zaman damgaları — süzme döngüsünden önce bir kez.
export function dateRangeBounds(r: OrderDateRange): [number, number] {
  return [startOfDay(r.from).getTime(), startOfDay(r.to).getTime() + DAY_MS];
}

// Seçilen aralığı kapsayan en dar yükleme dönemi (sunucu dönem bazında çeker;
// tarih süzmesi istemcide yapılır). getOrders'taki kesme tarihleriyle uyumlu.
export function periodForDate(from: Date): OrdersPeriod {
  const daysAgo = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(from).getTime()) / DAY_MS,
  );
  if (daysAgo <= 0) return "today";
  if (daysAgo <= 6) return "week";
  if (daysAgo <= 29) return "month";
  return "all";
}

const PERIOD_RANK: Record<OrdersPeriod, number> = { today: 0, week: 1, month: 2, all: 3 };
export const periodCovers = (have: OrdersPeriod, need: OrdersPeriod) =>
  PERIOD_RANK[have] >= PERIOD_RANK[need];

export function dateRangeLabel(r: OrderDateRange): string {
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("tr-TR", o);
  if (startOfDay(r.from).getTime() === startOfDay(r.to).getTime())
    return f(r.from, { day: "numeric", month: "long", weekday: "short" });
  const sameMonth =
    r.from.getMonth() === r.to.getMonth() && r.from.getFullYear() === r.to.getFullYear();
  return sameMonth
    ? `${r.from.getDate()}–${f(r.to, { day: "numeric", month: "long" })}`
    : `${f(r.from, { day: "numeric", month: "short" })} – ${f(r.to, { day: "numeric", month: "short" })}`;
}

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
  value: T | null;
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
  dateRange: OrderDateRange | null;
  onDateRangeChange: (r: OrderDateRange | null) => void;
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

export function countActiveFilters(
  c: ChannelFilter,
  s: OrderFilter,
  p: PaymentFilter,
  d: OrderDateRange | null,
) {
  return (c !== "all" ? 1 : 0) + (s !== "all" ? 1 : 0) + (p !== "all" ? 1 : 0) + (d ? 1 : 0);
}

// "Filtrele" tuşu + açılır filtre menüsü. memo + stabil handler'lar: arama
// yazılırken yeniden render olmaz.
function OrderFiltersImpl({
  open,
  onOpenChange,
  period,
  dateRange,
  onDateRangeChange,
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
  const activeCount = countActiveFilters(channel, status, payment, dateRange);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = startOfDay(new Date());
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
              <Segmented
                options={PERIOD_TABS}
                value={dateRange ? null : period}
                onChange={(p) => {
                  setCalendarOpen(false);
                  onPeriodChange(p);
                }}
              />
              <div
                className={cn(
                  "mt-1.5 flex items-center rounded-lg border text-xs transition-colors",
                  dateRange ? "border-foreground/30 bg-foreground/5" : "hover:bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => setCalendarOpen((v) => !v)}
                  aria-expanded={calendarOpen}
                  className="flex flex-1 items-center gap-2 px-2.5 py-1.5 text-left font-medium"
                >
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className={cn("flex-1", !dateRange && "text-muted-foreground")}>
                    {dateRange ? dateRangeLabel(dateRange) : "Tarih seç (gün veya aralık)"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      calendarOpen && "rotate-180",
                    )}
                  />
                </button>
                {dateRange && (
                  <button
                    type="button"
                    onClick={() => onDateRangeChange(null)}
                    aria-label="Tarihi temizle"
                    className="border-l px-2 py-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {calendarOpen && (
                <div className="mt-1.5 flex justify-center rounded-lg border">
                  <Calendar
                    mode="range"
                    resetOnSelect
                    locale={tr}
                    selected={dateRange ?? undefined}
                    defaultMonth={dateRange?.to ?? today}
                    endMonth={today}
                    disabled={{ after: today }}
                    onSelect={(r) => {
                      if (!r?.from) return onDateRangeChange(null);
                      onDateRangeChange({ from: r.from, to: r.to ?? r.from });
                    }}
                  />
                </div>
              )}
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
  dateRange: OrderDateRange | null;
  onDateRangeChange: (r: OrderDateRange | null) => void;
  channel: ChannelFilter;
  status: OrderFilter;
  payment: PaymentFilter;
  onChannelChange: (c: ChannelFilter) => void;
  onStatusChange: (s: OrderFilter) => void;
  onPaymentChange: (p: PaymentFilter) => void;
  onReset: () => void;
}

// Menü kapalıyken seçili filtreler: tek tıkla kaldırılabilir etiketler.
// Hazır dönem (Bugün/Hafta…) başlıkta yazdığı için burada gösterilmez.
function OrderActiveFiltersImpl({
  dateRange,
  onDateRangeChange,
  channel,
  status,
  payment,
  onChannelChange,
  onStatusChange,
  onPaymentChange,
  onReset,
}: OrderActiveFiltersProps) {
  const active: { key: string; group: string; label: string; clear: () => void }[] = [];
  if (dateRange)
    active.push({
      key: "date",
      group: "Tarih",
      label: dateRangeLabel(dateRange),
      clear: () => onDateRangeChange(null),
    });
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
