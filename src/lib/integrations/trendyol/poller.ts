// Polling cevabındaki "package" yapısını mevcut webhook mapper'ın anladığı
// TrendyolWebhookOrder şekline çevirir. Böylece mapTrendyolOrder'ı yeniden
// kullanabiliyoruz ve mapping mantığı tek yerde toplanıyor.

import type { TrendyolPackage } from "./client";
import type {
  TrendyolWebhookOrder,
  TrendyolWebhookProduct,
} from "./types";

function lineToWebhookProduct(
  line: TrendyolPackage["lines"][number],
): TrendyolWebhookProduct {
  // Doküman: "lines.items.length" sipariş içerisindeki adet sayısını verir.
  const quantity = Math.max(1, line.items?.length ?? 1);
  const unit = line.unitSellingPrice ?? line.price ?? 0;
  return {
    id: String(line.productId),
    name: line.name,
    quantity,
    price: unit,
    totalPrice: unit * quantity,
    modifierProducts: (line.modifierProducts ?? []).map((m) => ({
      name: m.name,
      quantity: 1,
      price: m.price,
    })),
  };
}

function paymentToWebhook(p: TrendyolPackage["payment"]): string {
  if (!p) return "Online";
  if (p.paymentType === "PAY_WITH_ON_DELIVERY") {
    const t = (p.onDelivery?.paymentType ?? "").toUpperCase();
    if (t === "CASH") return "Cash";
    if (t === "CARD") return "Card";
    return "CashOnDelivery";
  }
  return "Online";
}

export function packageToWebhookOrder(pkg: TrendyolPackage): TrendyolWebhookOrder {
  const fullAddress = [pkg.address?.address1, pkg.address?.address2]
    .filter(Boolean)
    .join(" ");

  return {
    id: pkg.id,
    orderNumber: pkg.orderNumber,
    packageId: pkg.id,
    status: pkg.packageStatus,
    creationDate: pkg.packageCreationDate,
    totalPrice: pkg.totalPrice,
    products: (pkg.lines ?? []).map(lineToWebhookProduct),
    customer: {
      firstName: pkg.customer?.firstName ?? pkg.address?.firstName,
      lastName: pkg.customer?.lastName ?? pkg.address?.lastName,
      phone: pkg.address?.phone,
      address: fullAddress,
      addressDescription: pkg.address?.addressDescription,
      district: pkg.address?.district,
      city: pkg.address?.city,
    },
    paymentMethod: paymentToWebhook(pkg.payment),
    customerNote: pkg.customerNote,
  };
}
