// Trendyol webhook payload'ını dahili Order tipine çevirir.
// Eksik alanlara toleranslı: bilinmeyenleri "Bilinmiyor" / 0 ile doldurur,
// kritik eksiklikte null döner (handler bunu 400 olarak yansıtır).

import {
  type Order,
  type OrderItem,
  type PaymentMethod,
  type Product,
} from "@/types";
import {
  type TrendyolWebhookOrder,
  type TrendyolWebhookProduct,
} from "./types";

// Trendyol -> dahili durum eşlemesi
function mapStatus(s: string | undefined): Order["status"] {
  const v = (s ?? "").toLowerCase();
  if (v.includes("cancel")) return "cancelled";
  if (v.includes("deliver")) return "delivered";
  if (v.includes("transport") || v.includes("way") || v.includes("courier"))
    return "on-the-way";
  if (v.includes("prepar") || v.includes("picking") || v.includes("ready"))
    return "preparing";
  return "pending";
}

// Trendyol -> dahili ödeme yöntemi eşlemesi
// Trendyol siparişleri büyük çoğunlukla online ödenmiş gelir
function mapPaymentMethod(m: string | undefined): PaymentMethod {
  const v = (m ?? "").toLowerCase();
  if (v.includes("cash")) return "cash";
  if (v.includes("card") && !v.includes("meal")) return "card";
  return "online";
}

function toProduct(p: TrendyolWebhookProduct, idx: number): Product {
  return {
    id: String(p.id ?? `ty-${idx}-${p.name}`),
    name: p.name,
    price: Math.round(p.price ?? p.totalPrice ?? 0),
    category: "kebap", // bilinmediği için varsayılan; UI'de gizlenebilir
    available: true,
  };
}

function toOrderItem(p: TrendyolWebhookProduct, idx: number): OrderItem {
  const product = toProduct(p, idx);
  const qty = Math.max(1, p.quantity ?? 1);
  const unit = p.price ?? (p.totalPrice ? p.totalPrice / qty : 0);
  const totalPrice = Math.round(p.totalPrice ?? unit * qty);
  const modifierNotes = (p.modifierProducts ?? [])
    .map((m) => `${m.quantity ?? 1}x ${m.name}`)
    .join(", ");
  const note = [p.note, modifierNotes].filter(Boolean).join(" | ") || undefined;
  return { product, quantity: qty, totalPrice, note };
}

function joinCustomerName(c: TrendyolWebhookOrder["customer"]): string {
  if (!c) return "Trendyol Müşterisi";
  if (c.name) return c.name;
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Trendyol Müşterisi";
}

export interface MappedOrder {
  ok: true;
  order: Order;
}
export interface MapError {
  ok: false;
  error: string;
}

function generateId(): string {
  return `ty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shortOrderNumber(externalRef: string): number {
  // Trendyol uzun bir kod gönderir; panelde göstermek için kısa numara üretiriz.
  // externalRef tam değeri korur. Hash bazlı 4 haneli.
  let h = 0;
  for (let i = 0; i < externalRef.length; i++) {
    h = (h * 31 + externalRef.charCodeAt(i)) | 0;
  }
  return 1000 + (Math.abs(h) % 9000);
}

export function mapTrendyolOrder(
  raw: TrendyolWebhookOrder,
): MappedOrder | MapError {
  const externalRef = String(raw.id ?? raw.orderNumber ?? raw.packageId ?? "");
  if (!externalRef) return { ok: false, error: "missing order id" };

  const productsSrc = raw.products ?? raw.items ?? [];
  if (productsSrc.length === 0)
    return { ok: false, error: "order has no products" };

  const items = productsSrc.map(toOrderItem);
  const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
  const deliveryFee = Math.round(raw.deliveryFee ?? 0);
  const total = Math.round(raw.totalPrice ?? subtotal + deliveryFee);

  const order: Order = {
    id: generateId(),
    orderNumber: shortOrderNumber(externalRef),
    items,
    customer: {
      name: joinCustomerName(raw.customer),
      phone: raw.customer?.phone ?? raw.customer?.phoneNumber ?? "",
      address: raw.customer?.address ?? raw.customer?.addressDescription ?? "",
      addressDetail: raw.customer?.addressDescription,
      district: raw.customer?.district,
    },
    payment: { method: mapPaymentMethod(raw.paymentMethod) },
    status: mapStatus(raw.status),
    notes: raw.note ?? raw.customerNote,
    subtotal,
    deliveryFee,
    total,
    source: "trendyol",
    externalRef,
    createdAt: raw.creationDate ? new Date(raw.creationDate) : new Date(),
    updatedAt: new Date(),
  };

  return { ok: true, order };
}
