"use client";

import { memo, useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  ClipboardList,
  CheckCircle2,
  Bike,
  XCircle,
  Banknote,
  CreditCard,
  Utensils,
  Landmark,
  Check,
  X,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  Order,
  OrderStatus,
  PaymentMethod,
  MealCardBrand,
} from "@/types";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";
import { getActiveCouriers, type Courier } from "@/actions/couriers";

// ─── Sabitler ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: OrderStatus; label: string; icon: React.ElementType }[] = [
  { value: "pending", label: "Beklemede", icon: Clock },
  { value: "preparing", label: "Hazırlanıyor", icon: ClipboardList },
  { value: "on-the-way", label: "Yolda", icon: Bike },
  { value: "delivered", label: "Teslim Edildi", icon: CheckCircle2 },
  { value: "cancelled", label: "İptal Edildi", icon: XCircle },
];

const PAYMENT_OPTIONS: {
  value: PaymentMethod;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { value: "cash", label: "Nakit", icon: Banknote, color: "border-green-300 bg-green-50 text-green-700" },
  { value: "card", label: "Kredi / Banka", icon: CreditCard, color: "border-blue-300 bg-blue-50 text-blue-700" },
  { value: "meal_card", label: "Yemek Kartı", icon: Utensils, color: "border-orange-300 bg-orange-50 text-orange-700" },
  { value: "iban", label: "IBAN / Havale", icon: Landmark, color: "border-purple-300 bg-purple-50 text-purple-700" },
];

const MEAL_BRANDS: { value: MealCardBrand; label: string }[] = [
  { value: "multinet", label: "Multinet" },
  { value: "setcard", label: "Setcard" },
  { value: "pluxee", label: "Pluxee" },
  { value: "edenred", label: "Edenred" },
  { value: "tokenflex", label: "Tokenflex" },
  { value: "metropol", label: "Metropol" },
];
const PAYMENT_LABEL: Record<string, string> = {
  cash: "💵 Nakit",
  card: "💳 Kart",
  online: "💳 Online",
  meal_card: "🍴 Yemek Kartı",
  iban: "🏦 IBAN",
};
const BRAND_LABEL: Record<string, string> = Object.fromEntries(
  MEAL_BRANDS.map((b) => [b.value, b.label]),
);

const UNASSIGNED = "__none__";

// Aktif kurye listesini modül seviyesinde 60 sn önbellekle (her detayda DB'ye gitme).
const COURIERS_TTL = 60_000;
let couriersCache: { at: number; data: Courier[] } | null = null;
async function getCachedActiveCouriers(): Promise<Courier[]> {
  if (couriersCache && Date.now() - couriersCache.at < COURIERS_TTL) {
    return couriersCache.data;
  }
  const data = await getActiveCouriers();
  couriersCache = { at: Date.now(), data };
  return data;
}

// Şerit içi etiketli alan.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

interface Props {
  order: Order;
  onStatusChange: (status: OrderStatus) => void;
  onCourierChange: (courier: string | null) => void;
  onPaymentUpdate: (newPayment: {
    method: PaymentMethod;
    mealCardBrand?: MealCardBrand;
    ibanName?: string;
    ibanNumber?: string;
  }) => Promise<void>;
}

// Sipariş yönetim şeridi: Durum + Kurye + Ödeme tek kompakt kartta (3 sütun).
// Eskiden 3 ayrı tam-genişlik kart vardı; bu, dikey boşluğu büyük ölçüde azaltır.
const OrderControlsCard = memo(function OrderControlsCard({
  order,
  onStatusChange,
  onCourierChange,
  onPaymentUpdate,
}: Props) {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [couriersLoaded, setCouriersLoaded] = useState(false);

  // Ödeme düzenleme — Popover (yüzen panel; layout'u aşağı itmez).
  const [payOpen, setPayOpen] = useState(false);
  const [editMethod, setEditMethod] = useState<PaymentMethod>(order.payment.method);
  const [editBrand, setEditBrand] = useState<MealCardBrand>(
    order.payment.mealCardBrand ?? "multinet",
  );
  const [savingPay, setSavingPay] = useState(false);

  useEffect(() => {
    getCachedActiveCouriers().then((c) => {
      setCouriers(c);
      setCouriersLoaded(true);
    });
  }, []);

  const handleStatus = useCallback(
    (val: string) => {
      onStatusChange(val as OrderStatus);
      toast.success("Durum güncellendi");
    },
    [onStatusChange],
  );

  const courierValue = order.courier ?? UNASSIGNED;
  const courierMissing =
    !!order.courier && !couriers.some((c) => c.name === order.courier);
  const showCourier = !couriersLoaded || couriers.length > 0 || !!order.courier;

  const handleCourier = useCallback(
    (val: string) => {
      const next = val === UNASSIGNED ? null : val;
      onCourierChange(next);
      toast.success(next ? `${next} atandı` : "Kurye ataması kaldırıldı");
    },
    [onCourierChange],
  );

  // Popover açılınca düzenleme state'ini siparişin güncel değerinden başlat.
  const onPayOpenChange = (open: boolean) => {
    if (open) {
      setEditMethod(order.payment.method);
      setEditBrand(order.payment.mealCardBrand ?? "multinet");
    }
    setPayOpen(open);
  };

  const savePay = async () => {
    setSavingPay(true);
    try {
      await onPaymentUpdate({
        method: editMethod,
        mealCardBrand: editMethod === "meal_card" ? editBrand : undefined,
        ibanName: editMethod === "iban" ? DEFAULT_IBAN_NAME : undefined,
        ibanNumber: editMethod === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
      });
      setPayOpen(false);
      toast.success("Ödeme yöntemi güncellendi");
    } finally {
      setSavingPay(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Durum */}
          <Field label="Durum">
            <Select value={order.status} onValueChange={handleStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {STATUS_OPTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        {s.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>

          {/* Kurye */}
          {showCourier && (
            <Field label="Kurye">
              <Select value={courierValue} onValueChange={handleCourier}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Atanmadı" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={UNASSIGNED}>Havuz (atanmadı)</SelectItem>
                  {couriers.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      <span className="flex items-center gap-2">
                        <Bike className="h-3.5 w-3.5" />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                  {courierMissing && (
                    <SelectItem value={order.courier!}>
                      {order.courier} (pasif)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>
          )}

          {/* Ödeme — tıkla, yüzen Popover'da düzenle (layout'u itmez) */}
          <Field label="Ödeme">
            <Popover open={payOpen} onOpenChange={onPayOpenChange}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-ring"
                >
                  <span className="truncate font-medium">
                    {PAYMENT_LABEL[order.payment.method] ?? order.payment.method}
                    {order.payment.method === "meal_card" &&
                      order.payment.mealCardBrand && (
                        <span className="text-muted-foreground">
                          {" · "}
                          {BRAND_LABEL[order.payment.mealCardBrand] ??
                            order.payment.mealCardBrand}
                        </span>
                      )}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={6} className="w-80 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ödeme Yöntemi
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const sel = editMethod === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditMethod(opt.value)}
                        disabled={savingPay}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-all",
                          sel
                            ? opt.color + " border-current shadow-sm"
                            : "border-border bg-background hover:bg-muted/50",
                          savingPay && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="font-medium leading-tight">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {editMethod === "meal_card" && (
                  <>
                    <p className="mt-3 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Kart Markası
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {MEAL_BRANDS.map((b) => (
                        <button
                          key={b.value}
                          type="button"
                          onClick={() => setEditBrand(b.value)}
                          disabled={savingPay}
                          className={cn(
                            "rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-all",
                            editBrand === b.value
                              ? "border-orange-400 bg-orange-100 text-orange-800 shadow-sm"
                              : "border-border bg-background hover:bg-muted/50",
                            savingPay && "cursor-not-allowed opacity-50",
                          )}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPayOpen(false)}
                    disabled={savingPay}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    İptal
                  </Button>
                  <Button size="sm" onClick={savePay} disabled={savingPay}>
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    {savingPay ? "Kaydediliyor..." : "Kaydet"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </Field>
        </div>
      </CardContent>
    </Card>
  );
});

export default OrderControlsCard;
