import { PORTION_OPTIONS, type OrderItem, type PortionOption } from "@/types";

// Satırın sepet/liste anahtarı. Sepet satırları kendi kimliğini (lineId)
// taşır — aynı ürün+porsiyon "soğansız" ve normal olarak iki satırda durabilir.
// lineId'siz eski veride ürün+porsiyon anahtarına düşülür.
export function orderItemKey(item: OrderItem): string {
  return item.lineId ?? productPortionKey(item);
}

function productPortionKey(item: Pick<OrderItem, "product" | "portion">): string {
  return item.portion ? `${item.product.id}:${item.portion.size}` : item.product.id;
}

// Satırın tüm içeriğini (ürün, porsiyon, seçimler, not) kapsayan imza.
// Aynı imzalı satırlar birebir aynı istektir; birleştirilebilir.
function itemSignature(item: OrderItem): string {
  const options = [...(item.options ?? [])].sort().join(",");
  return `${productPortionKey(item)}|${options}|${item.note?.trim() ?? ""}`;
}

let lineSeq = 0;
export function newLineId(): string {
  lineSeq += 1;
  return `l${Date.now().toString(36)}${lineSeq.toString(36)}`;
}

// Satır seçimsiz ve notsuz mu — ürün kartından eklenen yeni adet buraya eklenir.
export function isPlainItem(item: OrderItem): boolean {
  return !(item.options?.length) && !item.note?.trim();
}

// Satırın birim fiyatı — porsiyonluysa ürün fiyatı × çarpan (tam TL'ye yuvarlı),
// üstüne ücretli seçenekler (yumurtalı +30₺). Ek ücret porsiyonla çarpılmaz.
// Sepet, store ve fiş aynı kuralı kullansın diye tek yerde.
export function orderItemUnitPrice(
  item: Pick<OrderItem, "product" | "portion" | "optionExtras">,
): number {
  const base = item.portion
    ? Math.round(item.product.price * item.portion.multiplier)
    : item.product.price;
  return base + optionExtrasTotal(item);
}

export function optionExtrasTotal(item: Pick<OrderItem, "optionExtras">): number {
  return (item.optionExtras ?? []).reduce((sum, e) => sum + e.price, 0);
}

// Porsiyonun görünen adı. Etiket siparişe kopyalandığı için eski kayıtlarda
// farklı yazılmış olabilir; boyuttan güncel etiket bulunur.
export function portionLabel(portion: Pick<PortionOption, "size" | "label">): string {
  return PORTION_OPTIONS.find((p) => p.size === portion.size)?.label ?? portion.label;
}

// DB'den okunan sipariş satırlarını düzeltir. Sipariş şemasında `portion`
// alanı bir süre YOKTU; mongoose porsiyonu sessizce atıyordu. O dönemin
// kayıtlarında:
//  - porsiyon, satır tutarının (birim fiyat × adet) oranından geri çıkarılır
//    (0.5 / 1.5 — fiyat sipariş anındaki kopya olduğu için oran kesin);
//  - birebir aynı satırlar ("1 Porsiyon" + düz ekleme, ikisi de 1×)
//    birleştirilir. Her satıra imzasından kararlı bir lineId verilir
//    (lineId DB'de tutulmaz); React anahtarı ve düzenleme bu kimliği kullanır.
export function normalizeOrderItems(items: OrderItem[]): OrderItem[] {
  const merged = new Map<string, OrderItem>();
  for (const raw of items) {
    let item = raw;
    if (!item.portion && item.quantity > 0 && item.product.price > 0) {
      const baseUnit = item.totalPrice / item.quantity - optionExtrasTotal(item);
      const ratio = baseUnit / item.product.price;
      const portion = PORTION_OPTIONS.find(
        (p) => p.multiplier !== 1 && Math.abs(p.multiplier - ratio) < 0.01,
      );
      if (portion) item = { ...item, portion };
    }
    const key = itemSignature(item);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...item, lineId: key });
      continue;
    }
    merged.set(key, {
      ...prev,
      quantity: prev.quantity + item.quantity,
      totalPrice: prev.totalPrice + item.totalPrice,
    });
  }
  return [...merged.values()];
}
