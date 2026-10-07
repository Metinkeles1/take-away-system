import { type PaymentInfo, type PaymentPart } from "@/types";

// Bölünmüş ödemenin (300 nakit + 100 kart) tek hesap noktası. Kasa, gün sonu
// ve dashboard dökümleri yöntem başına tutarı buradan okur.

type PaymentLike = Partial<Pick<PaymentInfo, "method" | "mealCardBrand" | "split">> | null | undefined;

const EPS = 0.01;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Siparişin yöntem başına tutarları. Bölünmemişse tek parça: tamamı `method`.
export function paymentParts(payment: PaymentLike, total: number): PaymentPart[] {
  if (payment?.split && payment.split.length >= 2) return payment.split;
  if (!payment?.method) return [];
  return [{ method: payment.method, amount: total, mealCardBrand: payment.mealCardBrand }];
}

// Siparişin yemek kartıyla ödenen kısmı (sağlayıcı kesintisi yalnız buna uygulanır).
export function mealCardShare(payment: PaymentLike, total: number): number {
  return paymentParts(payment, total)
    .filter((p) => p.method === "meal_card")
    .reduce((s, p) => s + p.amount, 0);
}

// Mongo filtresi: ana yöntemi YA DA bölünmüş parçalarından biri bu yöntem olan
// siparişler. $and içinde ki kaynak filtresinin $or'u ile çakışmasın.
export function paymentMethodFilter(method: string) {
  return {
    $and: [{ $or: [{ "payment.method": method }, { "payment.split.method": method }] }],
  };
}

export function isSplitPayment(payment: PaymentLike): boolean {
  return !!payment?.split && payment.split.length >= 2;
}

// Bölünmüş ödemede ana yöntem = en büyük parça (eşitse ilk).
export function primaryPart(parts: PaymentPart[]): PaymentPart {
  return parts.reduce((best, p) => (p.amount > best.amount ? p : best), parts[0]);
}

// Parçaları kayda hazırla: tutarlar kuruşa yuvarlanır, aynı yöntem birleştirilir.
// Geçersizse hata mesajı döner (en az 2 yöntem, hepsi > 0, toplam = sipariş toplamı).
export function normalizeSplit(
  parts: PaymentPart[],
  total: number,
): { ok: true; parts: PaymentPart[] } | { ok: false; error: string } {
  const merged: PaymentPart[] = [];
  for (const p of parts) {
    const amount = round2(Number(p.amount));
    if (!(amount > 0)) return { ok: false, error: "Her parçanın tutarı 0'dan büyük olmalı" };
    const same = merged.find((m) => m.method === p.method);
    if (same) same.amount = round2(same.amount + amount);
    else
      merged.push({
        method: p.method,
        amount,
        ...(p.method === "meal_card" && p.mealCardBrand ? { mealCardBrand: p.mealCardBrand } : {}),
      });
  }
  if (merged.length < 2) return { ok: false, error: "En az iki farklı ödeme yöntemi seçin" };
  const sum = merged.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(sum - total) > EPS) {
    return { ok: false, error: "Parçaların toplamı sipariş tutarına eşit olmalı" };
  }
  return { ok: true, parts: merged };
}
