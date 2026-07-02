// Trendyol GO paketini kurye sayfasının `Order` şekline çevirir. Amaç: Trendyol
// siparişlerinin mevcut OrderCard + rota yardımcılarıyla AYNEN render edilmesi —
// kart, "Git", yakınlık-sıralı toplu rota hepsi tek kod yolundan geçsin.
//
// Bu objeler EPHEMERAL'dir (DB'ye yazılmaz). id `ty-<packageId>` ile damgalanır,
// externalRef = packageId (teslim çağrısı bununla yapılır). source = "trendyol"
// olduğundan kurye sayfası pin/ödeme düzenleme/claim'i bu kartlarda kapatır.

import type {
  MealCardBrand,
  Order,
  OrderItem,
  PaymentMethod,
  ProductCategory,
} from "@/types";
import type { TrendyolPackage } from "./client";

// Trendyol ödeme tipini panelin ödeme yöntemine eşler. Online ödenmiş (kart /
// yemek kartı online) siparişlerde kurye tahsilat YAPMAZ — rozet yine de doğru
// görünsün diye yöntem işaretlenir. Kapıda ödeme (PAY_WITH_ON_DELIVERY) tahsilatlıdır.
function mapTrendyolPayment(payment?: TrendyolPackage["payment"]): {
  method: PaymentMethod;
  mealCardBrand?: MealCardBrand;
} {
  if (!payment) return { method: "online" };

  const brandFromSource = (raw?: string): MealCardBrand | undefined => {
    const s = (raw ?? "").toUpperCase();
    if (s.includes("PLUXEE") || s.includes("SODEXO")) return "pluxee";
    if (s.includes("MULTINET")) return "multinet";
    if (s.includes("EDENRED")) return "edenred";
    if (s.includes("SETCARD")) return "setcard";
    if (s.includes("METROPOL")) return "metropol";
    if (s.includes("TOKENFLEX")) return "tokenflex";
    return undefined;
  };

  if (payment.paymentType === "PAY_WITH_MEAL_CARD") {
    return {
      method: "meal_card",
      mealCardBrand: brandFromSource(payment.mealCard?.cardSourceType ?? undefined),
    };
  }
  if (payment.paymentType === "PAY_WITH_ON_DELIVERY") {
    const t = (payment.onDelivery?.paymentType ?? "").toUpperCase();
    if (t === "CASH") return { method: "cash" };
    if (t === "CARD") return { method: "card" };
    // Kapıda Pluxee/Multinet/Edenred/Setcard/... kart/kod → yemek kartı
    return { method: "meal_card", mealCardBrand: brandFromSource(t) };
  }
  // PAY_WITH_CARD → online ödenmiş kart (kurye tahsilat yapmaz)
  return { method: "online" };
}

export function mapTrendyolPackageToOrder(p: TrendyolPackage): Order {
  const a = p.address ?? {};

  const lat = a.latitude ? Number.parseFloat(a.latitude) : NaN;
  const lng = a.longitude ? Number.parseFloat(a.longitude) : NaN;
  const geo =
    Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

  const name =
    [a.firstName, a.lastName].filter(Boolean).join(" ").trim() ||
    [p.customer?.firstName, p.customer?.lastName].filter(Boolean).join(" ").trim() ||
    "Trendyol Müşteri";

  const address =
    [a.address1, a.address2].filter(Boolean).join(" ").trim() ||
    a.neighborhood ||
    "Adres bilgisi yok";

  const items: OrderItem[] = p.lines.map((l) => {
    const unit = l.unitSellingPrice ?? l.price ?? 0;
    const qty = l.items?.length || 1;
    return {
      product: {
        id: String(l.productId),
        name: l.name,
        price: unit,
        // Kurye kartında kategori gösterilmez; tip gereği geçerli bir değer veriyoruz.
        category: "kebap" as ProductCategory,
        available: true,
      },
      quantity: qty,
      totalPrice: unit * qty,
    };
  });

  const { method, mealCardBrand } = mapTrendyolPayment(p.payment);
  const createdAt = new Date(p.packageCreationDate);

  // Trendyol paket statüsü → dahili Order.status. Shipped = kurye yola çıkmış
  // (henüz teslim değil) → "on-the-way" (kartta "Teslim" görünür). Picking/Invoiced
  // = henüz hazırlık/bekleme → "preparing" (kartta "Yola çıktım" adımı görünür).
  const status: Order["status"] =
    p.packageStatus === "Shipped" ? "on-the-way" : "preparing";

  return {
    id: `ty-${p.id}`,
    orderNumber: Number(p.orderNumber) || 0,
    items,
    customer: {
      name,
      phone: a.phone ?? p.callCenterPhone ?? "",
      address,
      district: a.district || undefined,
      geo,
    },
    payment: { method, mealCardBrand },
    status,
    notes: p.customerNote || undefined,
    subtotal: p.totalPrice,
    deliveryFee: 0,
    total: p.totalPrice,
    source: "trendyol",
    externalRef: p.id, // packageId — manual-delivered çağrısı bununla yapılır
    createdAt,
    updatedAt: createdAt,
  };
}
