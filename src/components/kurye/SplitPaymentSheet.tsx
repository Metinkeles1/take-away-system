"use client";

// Kapıda bölünmüş ödeme: müşteri tutarın bir kısmını bir yöntemle, kalanını
// başka yöntemle öder ("300 nakit + 100 kart"). Kurye 1. parçanın tutarını
// yazar, 2. parça kalan olarak hesaplanır. Kayıt sunucuda doğrulanır.

import { useState } from "react";
import { Banknote, Check, CreditCard, Landmark, Loader2, Split, WalletCards, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { type MealCardBrand, type Order, type PaymentMethod, type PaymentPart } from "@/types";

const METHODS: { value: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { value: "cash", label: "Nakit", icon: Banknote },
  { value: "card", label: "Kart", icon: CreditCard },
  { value: "meal_card", label: "Yemek K.", icon: WalletCards },
  { value: "iban", label: "IBAN", icon: Landmark },
];

const BRANDS: { value: MealCardBrand; label: string }[] = [
  { value: "multinet", label: "Multinet" },
  { value: "setcard", label: "Setcard" },
  { value: "pluxee", label: "Pluxee" },
  { value: "edenred", label: "Edenred" },
  { value: "tokenflex", label: "Tokenflex" },
  { value: "metropol", label: "Metropol" },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

// "300", "300,50" → 300.5; boş/bozuk → NaN
const parseAmount = (v: string) => Number(v.replace(/\s/g, "").replace(",", "."));

function MethodChips({
  value,
  disabled,
  onChange,
}: {
  value: PaymentMethod;
  disabled?: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {METHODS.map((m) => {
        const active = value === m.value;
        const off = disabled === m.value;
        return (
          <button
            key={m.value}
            type="button"
            disabled={off}
            onClick={() => onChange(m.value)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-bold ring-1 transition active:scale-95",
              active
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-600 ring-slate-200",
              off && "opacity-30",
            )}
          >
            <m.icon className="h-4 w-4" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export function SplitPaymentSheet({
  order,
  onClose,
  onSave,
}: {
  order: Order;
  onClose: () => void;
  /** null → bölmeyi kaldır. Hata varsa mesaj döner. */
  onSave: (parts: PaymentPart[] | null) => Promise<string | null>;
}) {
  const total = order.total;
  const existing = order.payment.split;
  const firstMethod: PaymentMethod =
    existing?.[0]?.method ?? (order.payment.method === "card" ? "card" : "cash");

  const [m1, setM1] = useState<PaymentMethod>(firstMethod);
  const [m2, setM2] = useState<PaymentMethod>(
    existing?.[1]?.method ?? (firstMethod === "card" ? "cash" : "card"),
  );
  const [amount1, setAmount1] = useState(existing?.[0] ? String(existing[0].amount) : "");
  const [brand, setBrand] = useState<MealCardBrand | undefined>(
    existing?.find((p) => p.method === "meal_card")?.mealCardBrand ??
      order.payment.mealCardBrand,
  );
  const [saving, setSaving] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const a1 = parseAmount(amount1);
  const a2 = round2(total - (Number.isFinite(a1) ? a1 : 0));
  const usesMeal = m1 === "meal_card" || m2 === "meal_card";

  const problem = !amount1
    ? "1. parçanın tutarını yazın"
    : !Number.isFinite(a1) || a1 <= 0
      ? "Geçerli bir tutar yazın"
      : a1 >= total
        ? `Tutar ${formatCurrency(total)}'den az olmalı`
        : m1 === m2
          ? "İki farklı yöntem seçin"
          : usesMeal && !brand
            ? "Yemek kartı markasını seçin"
            : null;

  // Aynı yöntem seçilirse diğer parçayı otomatik değiştir.
  const pick1 = (m: PaymentMethod) => {
    setM1(m);
    if (m === m2) setM2(m === "cash" ? "card" : "cash");
  };

  const run = async (kind: "save" | "remove") => {
    setSaving(kind);
    setError(null);
    const brandFor = (m: PaymentMethod) => (m === "meal_card" ? brand : undefined);
    const err = await onSave(
      kind === "remove"
        ? null
        : [
            { method: m1, amount: round2(a1), mealCardBrand: brandFor(m1) },
            { method: m2, amount: a2, mealCardBrand: brandFor(m2) },
          ],
    );
    setSaving(null);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Split className="h-5 w-5 text-slate-700" />
          <h3 className="text-base font-bold text-slate-900">Ödemeyi böl</h3>
          <span className="ml-auto text-sm font-bold tabular-nums text-slate-900">
            {formatCurrency(total)}
          </span>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition active:scale-90 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">1. ödeme</p>
          <MethodChips value={m1} onChange={pick1} />
          <div className="relative">
            <input
              inputMode="decimal"
              autoFocus
              placeholder="Tutar"
              value={amount1}
              onChange={(e) => setAmount1(e.target.value.replace(/[^\d.,]/g, ""))}
              className="h-12 w-full rounded-xl border border-slate-200 px-4 pr-10 text-lg font-bold tabular-nums outline-none focus:border-slate-900"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">₺</span>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">2. ödeme (kalan)</p>
          <MethodChips value={m2} disabled={m1} onChange={setM2} />
          <div className="flex h-12 items-center justify-between rounded-xl bg-slate-50 px-4">
            <span className="text-sm text-slate-500">Kalan</span>
            <span className="text-lg font-bold tabular-nums text-slate-900">
              {a2 > 0 ? formatCurrency(a2) : "—"}
            </span>
          </div>
        </div>

        {usesMeal && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Yemek kartı</p>
            <div className="grid grid-cols-3 gap-1.5">
              {BRANDS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setBrand(b.value)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-bold ring-1 transition active:scale-95",
                    brand === b.value
                      ? "bg-orange-500 text-white ring-orange-500"
                      : "bg-white text-slate-600 ring-slate-200",
                  )}
                >
                  {brand === b.value && <Check className="h-3.5 w-3.5" />}
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(error || (amount1 && problem)) && (
          <p className="mt-3 text-sm font-medium text-rose-600">{error ?? problem}</p>
        )}

        <div className="mt-5 flex gap-2">
          {existing && (
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void run("remove")}
              className="h-12 rounded-2xl px-4 text-sm font-bold text-slate-600 ring-1 ring-slate-200 transition active:scale-95 disabled:opacity-50"
            >
              {saving === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bölmeyi kaldır"}
            </button>
          )}
          <button
            type="button"
            disabled={!!problem || saving !== null}
            onClick={() => void run("save")}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {saving === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
