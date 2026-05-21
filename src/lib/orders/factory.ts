import {
  type CustomerInfo,
  type Order,
  type OrderDraft,
  type PaymentInfo,
} from "@/types";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function generateOrderNumber(): number {
  return Math.floor(1000 + Math.random() * 9000);
}

export function calcSubtotal(items: OrderDraft["items"]): number {
  return items.reduce((sum, i) => sum + i.totalPrice, 0);
}

// Manuel teslim alımında delivery fee şu an sabit 0 — değişirse tek nokta.
export function calcDeliveryFee(): number {
  return 0;
}

// Ödeme yönteminden bağımsız alanları temizler, yöntem-spesifik alanları doldurur.
// Pure: store/UI yan etkisi yok.
export function normalizePayment(
  payment: Partial<PaymentInfo>,
  total: number,
): PaymentInfo {
  const method = payment.method!;
  const cashGiven = payment.cashGiven ?? 0;
  return {
    method,
    cashGiven: method === "cash" ? cashGiven : undefined,
    change: method === "cash" ? Math.max(0, cashGiven - total) : undefined,
    mealCardBrand: method === "meal_card" ? payment.mealCardBrand : undefined,
    // ibanName/ibanNumber DB'ye gitmez; sadece fiş önizlemesi için draft'ta tutulur.
    ibanName: method === "iban" ? DEFAULT_IBAN_NAME : undefined,
    ibanNumber: method === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
  };
}

// Draft → kaydedilmeye hazır Order. Validation çağıran tarafa ait (selectCanComplete).
export function buildOrderFromDraft(draft: OrderDraft): Order {
  const subtotal = calcSubtotal(draft.items);
  const deliveryFee = calcDeliveryFee();
  const total = subtotal + deliveryFee;

  return {
    id: generateId(),
    orderNumber: generateOrderNumber(),
    items: draft.items,
    customer: draft.customer as CustomerInfo,
    payment: normalizePayment(draft.payment, total),
    status: "pending",
    notes: draft.notes,
    subtotal,
    deliveryFee,
    total,
    source: "manual",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
