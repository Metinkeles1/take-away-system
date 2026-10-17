"use client";

// Kapıda bölünmüş ödeme: müşteri tutarın bir kısmını bir yöntemle, kalanını
// başka yöntemle öder ("300 nakit + 100 kart"). Kurye 1. parçanın tutarını
// yazar, 2. parça kalan olarak hesaplanır. Kayıt sunucuda doğrulanır.

import { useState } from "react";
import { Banknote, Check, CreditCard, Landmark, Loader2, Split, WalletCards, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { type MealCardBrand, type Order, type PaymentMethod, type PaymentPart } from "@/types";

type MethodDef = {
  value: PaymentMethod;
  label: string;
  icon: React.ElementType;
  // Seçili segment yazısı + özet çubuğundaki renk
  text: string;
  bar: string;
};

const METHODS: MethodDef[] = [
  { value: "cash", label: "Nakit", icon: Banknote, text: "text-emerald-700", bar: "bg-emerald-500" },
  { value: "card", label: "Kart", icon: CreditCard, text: "text-blue-700", bar: "bg-blue-500" },
  { value: "meal_card", label: "Yemek K.", icon: WalletCards, text: "text-orange-700", bar: "bg-orange-500" },
  { value: "iban", label: "IBAN", icon: Landmark, text: "text-violet-700", bar: "bg-violet-500" },
];

const methodDef = (m: PaymentMethod) => METHODS.find((x) => x.value === m) ?? METHODS[0];

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

// Tutar kısayolları: yarısı + toplamın altındaki yuvarlak tutarlar (en fazla 3).
function quickAmounts(total: number): { label: string; value: number }[] {
  const half = round2(total / 2);
  const step = total > 300 ? 100 : 50;
  const rounds = [step, step * 2, step * 3].filter((v) => v < total && v !== half);
  return [
    { label: "Yarısı", value: half },
    ...rounds.map((v) => ({ label: formatCurrency(v), value: v })),
  ];
}

// Tek seçimli segment: gri zemin üstünde seçili olan beyaz kart gibi kalkar.
function MethodSegment({
  options,
  value,
  onChange,
}: {
  options: MethodDef[];
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "grid gap-1 rounded-xl bg-slate-100 p-1",
        options.length === 4 ? "grid-cols-4" : "grid-cols-3",
      )}
    >
      {options.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.value)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg py-2 text-xs font-bold transition active:scale-95",
              active
                ? cn("bg-white shadow-sm ring-1 ring-slate-200", m.text)
                : "text-slate-500",
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

function StepBadge({ n }: { n: number }) {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
      {n}
    </span>
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
  const a1Valid = Number.isFinite(a1) && a1 > 0 && a1 < total;
  const a2 = round2(total - (Number.isFinite(a1) ? a1 : 0));
  const usesMeal = m1 === "meal_card" || m2 === "meal_card";

  const problem = !amount1
    ? "1. ödemenin tutarını yazın"
    : !Number.isFinite(a1) || a1 <= 0
      ? "Geçerli bir tutar yazın"
      : a1 >= total
        ? `Tutar ${formatCurrency(total)}'den az olmalı`
        : m1 === m2
          ? "İki farklı yöntem seçin"
          : usesMeal && !brand
            ? "Yemek kartı markasını seçin"
            : null;

  // 2. ödemede 1. yöntem listelenmez; çakışırsa diğer parça otomatik değişir.
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

  const d1 = methodDef(m1);
  const d2 = methodDef(m2);
  const pct1 = a1Valid ? (a1 / total) * 100 : 0;

  const brandPicker = (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-semibold text-slate-500">Yemek kartı markası</p>
      <div className="grid grid-cols-3 gap-1.5">
        {BRANDS.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => setBrand(b.value)}
            className={cn(
              "flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold ring-1 transition active:scale-95",
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
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 pt-5 pb-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100">
            <Split className="h-5 w-5 text-slate-700" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">Ödemeyi böl</h3>
            <p className="text-sm text-slate-500">
              Toplam <span className="font-bold tabular-nums text-slate-900">{formatCurrency(total)}</span>{" "}
              iki yöntemle alınır
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-9 w-9 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {/* 1. ödeme — kurye yöntemi seçer, tutarı yazar */}
          <section className="rounded-2xl p-4 ring-1 ring-slate-200">
            <div className="mb-3 flex items-center gap-2">
              <StepBadge n={1} />
              <p className="text-sm font-bold text-slate-900">İlk ödeme</p>
              <span className="ml-auto text-xs text-slate-400">yöntem seç, tutar yaz</span>
            </div>
            <MethodSegment options={METHODS} value={m1} onChange={pick1} />

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                {d1.label} ile alınan tutar
              </span>
              <div className="relative">
                <input
                  inputMode="decimal"
                  autoFocus
                  placeholder="0"
                  value={amount1}
                  onChange={(e) => setAmount1(e.target.value.replace(/[^\d.,]/g, ""))}
                  className="h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 pr-12 text-2xl font-bold tabular-nums text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-900"
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xl font-bold text-slate-400">
                  ₺
                </span>
              </div>
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickAmounts(total).map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setAmount1(String(q.value))}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition active:scale-95"
                >
                  {q.label}
                </button>
              ))}
            </div>
            {m1 === "meal_card" && brandPicker}
          </section>

          {/* 2. ödeme — tutar otomatik (kalan), yalnız yöntem seçilir */}
          <section className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="mb-3 flex items-center gap-2">
              <StepBadge n={2} />
              <p className="text-sm font-bold text-slate-900">Kalan ödeme</p>
              <span className="ml-auto text-xs text-slate-400">sadece yöntem seç</span>
            </div>
            <MethodSegment
              options={METHODS.filter((m) => m.value !== m1)}
              value={m2}
              onChange={setM2}
            />
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-500">
                {d2.label} ile alınacak · otomatik
              </span>
              <span
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  a1Valid ? "text-slate-900" : "text-slate-300",
                )}
              >
                {a1Valid ? formatCurrency(a2) : "—"}
              </span>
            </div>
            {m2 === "meal_card" && brandPicker}
          </section>

          {/* Özet: iki parçanın toplama oranı */}
          {a1Valid && (
            <div className="space-y-1.5 px-1">
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={d1.bar} style={{ width: `${pct1}%` }} />
                <div className={d2.bar} style={{ width: `${100 - pct1}%` }} />
              </div>
              <p className="text-center text-xs font-medium text-slate-500 tabular-nums">
                {d1.label} {formatCurrency(a1)} + {d2.label} {formatCurrency(a2)} ={" "}
                <span className="font-bold text-slate-900">{formatCurrency(total)}</span>
              </p>
            </div>
          )}
        </div>

        {/* Alt çubuk */}
        <div className="border-t border-slate-100 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {(error || problem) && (
            <p
              className={cn(
                "mb-2 text-center text-sm font-medium",
                error || amount1 ? "text-rose-600" : "text-slate-400",
              )}
            >
              {error ?? problem}
            </p>
          )}
          <button
            type="button"
            disabled={!!problem || saving !== null}
            onClick={() => void run("save")}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-sm shadow-emerald-600/25 transition active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {saving === "save" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            Bölmeyi kaydet
          </button>
          {existing && (
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void run("remove")}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold text-rose-600 transition active:scale-95 disabled:opacity-50"
            >
              {saving === "remove" && <Loader2 className="h-4 w-4 animate-spin" />}
              Bölmeyi kaldır (tek yönteme dön)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
