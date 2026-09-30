import { PORTION_OPTIONS, type OrderItem } from "@/types";

// Satırın sepet/liste anahtarı — orderStore ile aynı kural:
// porsiyonsuz "productId", porsiyonlu "productId:size".
export function orderItemKey(item: OrderItem): string {
  return item.portion ? `${item.product.id}:${item.portion.size}` : item.product.id;
}

// DB'den okunan sipariş satırlarını düzeltir. Sipariş şemasında `portion`
// alanı bir süre YOKTU; mongoose porsiyonu sessizce atıyordu. O dönemin
// kayıtlarında:
//  - porsiyon, satır tutarının (birim fiyat × adet) oranından geri çıkarılır
//    (0.5 / 1.5 — fiyat sipariş anındaki kopya olduğu için oran kesin);
//  - aynı anahtara düşen satırlar ("1 Porsiyon" + düz ekleme, ikisi de 1×)
//    birleştirilir. Aksi halde React anahtarı çakışır ve düzenlemede adet
//    değişikliği iki satıra birden uygulanır.
export function normalizeOrderItems(items: OrderItem[]): OrderItem[] {
  const merged = new Map<string, OrderItem>();
  for (const raw of items) {
    let item = raw;
    if (!item.portion && item.quantity > 0 && item.product.price > 0) {
      const ratio = item.totalPrice / (item.quantity * item.product.price);
      const portion = PORTION_OPTIONS.find(
        (p) => p.multiplier !== 1 && Math.abs(p.multiplier - ratio) < 0.01,
      );
      if (portion) item = { ...item, portion };
    }
    const key = orderItemKey(item);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, item);
      continue;
    }
    const notes = [prev.note, item.note].filter(Boolean);
    merged.set(key, {
      ...prev,
      quantity: prev.quantity + item.quantity,
      totalPrice: prev.totalPrice + item.totalPrice,
      note: notes.length > 0 ? [...new Set(notes)].join(" / ") : undefined,
    });
  }
  return [...merged.values()];
}
