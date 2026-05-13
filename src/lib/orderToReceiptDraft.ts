import { type Order, type OrderDraft } from "@/types";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";

// Order'ı ThermalReceipt'in beklediği OrderDraft formatına çevirir.
// IBAN gibi DB'ye yazılmayan alanlar burada doldurulur.
export function orderToReceiptDraft(order: Order): OrderDraft {
  return {
    items: order.items,
    customer: order.customer,
    payment: {
      ...order.payment,
      ibanName: order.payment.method === "iban" ? DEFAULT_IBAN_NAME : undefined,
      ibanNumber:
        order.payment.method === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
    },
    notes: order.notes,
  };
}
