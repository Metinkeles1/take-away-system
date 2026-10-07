import { type DiscountInput, type OrderDiscount } from "@/types";

// Sepet indiriminin tek hesap noktası: sepet, fiş, kayıt ve düzenleme bunu kullanır.

// Yüzde ve tutar sepette tek tıkla seçilsin diye hazır değerler.
export const QUICK_DISCOUNT_PERCENTS = [5, 10, 15, 20];

// İndirimin ₺ karşılığı. Kuruş çıkmasın diye tam liraya yuvarlanır ve
// ara toplamı aşamaz (sipariş eksiye düşmesin).
export function calcDiscountAmount(subtotal: number, d?: DiscountInput | null): number {
  if (!d || !(d.value > 0) || subtotal <= 0) return 0;
  const raw = d.type === "percent" ? (subtotal * Math.min(d.value, 100)) / 100 : d.value;
  return Math.min(subtotal, Math.round(raw));
}

// Kaydedilecek indirim; etkisizse (0 ₺) undefined — sipariş indirimsiz sayılır.
export function resolveDiscount(
  subtotal: number,
  d?: DiscountInput | null,
): OrderDiscount | undefined {
  const amount = calcDiscountAmount(subtotal, d);
  if (!d || amount <= 0) return undefined;
  return { type: d.type, value: d.value, amount };
}

// Fiş/ekran etiketi: "İndirim (%10)" veya "İndirim".
export function discountLabel(d?: DiscountInput | null): string {
  return d?.type === "percent" ? `İndirim (%${d.value})` : "İndirim";
}
