// Geliştirme amaçlı: gerçek Trendyol formatında sahte payload üretir.
// /api/dev/trendyol-sim bunu kendi webhook'umuza POST eder.

import { type TrendyolWebhookOrder } from "./types";

const SAMPLE_PRODUCTS = [
  { name: "Adana Kebap", price: 240 },
  { name: "Urfa Kebap", price: 240 },
  { name: "Lahmacun", price: 90 },
  { name: "Kıymalı Pide", price: 220 },
  { name: "Ayran", price: 25 },
  { name: "Künefe", price: 180 },
];

const SAMPLE_CUSTOMERS = [
  { name: "Mehmet Yılmaz", phone: "05321112233", district: "Kadıköy" },
  { name: "Ayşe Demir", phone: "05334445566", district: "Üsküdar" },
  { name: "Ali Kaya", phone: "05357778899", district: "Beşiktaş" },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMockTrendyolOrder(): TrendyolWebhookOrder {
  const productCount = 1 + Math.floor(Math.random() * 3);
  const products = Array.from({ length: productCount }, () => {
    const base = pick(SAMPLE_PRODUCTS);
    const qty = 1 + Math.floor(Math.random() * 2);
    return {
      id: `ty-prod-${Math.random().toString(36).slice(2, 7)}`,
      name: base.name,
      quantity: qty,
      price: base.price,
      totalPrice: base.price * qty,
    };
  });

  const customer = pick(SAMPLE_CUSTOMERS);
  const subtotal = products.reduce((s, p) => s + (p.totalPrice ?? 0), 0);

  // "MOCK-DEV-" prefix'i webhook/order action tarafında outbound Trendyol
  // çağrılarını atlamak için bir işaretçi. Gerçek Trendyol packageId'leri
  // bu prefix'le başlamaz — yalnızca lokal simülatörden gelir.
  return {
    id: `MOCK-DEV-${Date.now()}`,
    orderNumber: `MOCK-DEV-${Date.now()}`,
    status: "Created",
    creationDate: new Date().toISOString(),
    totalPrice: subtotal,
    deliveryFee: 0,
    products,
    customer: {
      name: customer.name,
      phone: customer.phone,
      address: `${customer.district} Mah. Test Sk. No:${Math.floor(Math.random() * 100)}`,
      district: customer.district,
    },
    paymentMethod: "Online",
    note: Math.random() > 0.7 ? "Acılı olmasın lütfen" : undefined,
  };
}
