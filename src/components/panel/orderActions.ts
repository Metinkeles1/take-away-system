import { handOverCourierCash, type CourierCashOrder } from "@/actions/courierCash";
import { setOrderCourier } from "@/actions/courier";
import { updateOrderStatus } from "@/actions/orders";
import {
  claimTrendyolPackage,
  deliverTrendyolCourierPackage,
  takeOverTrendyolPackage,
  unclaimTrendyolPackage,
} from "@/actions/trendyolCourier";
import type { Order } from "@/types";

// Panelden sipariş işlemleri — kendi siparişimiz ile Trendyol paketi farklı
// action'lara gider; kart bu ayrımı bilmesin diye burada toplanır.
type Result = { ok: boolean; error?: string };

const isTy = (o: Order) => o.source === "trendyol" && !!o.externalRef;

export async function assignCourier(o: Order, name: string): Promise<Result> {
  if (isTy(o)) {
    return o.courier
      ? takeOverTrendyolPackage(o.externalRef!, name, o.courier)
      : claimTrendyolPackage(o.externalRef!, name);
  }
  // Kendi siparişimizde son söz yöneticide — doğrudan yazılır.
  return setOrderCourier(o.id, name);
}

export async function releaseCourier(o: Order): Promise<Result> {
  if (isTy(o)) return o.courier ? unclaimTrendyolPackage(o.externalRef!, o.courier) : { ok: true };
  return setOrderCourier(o.id, null);
}

// Trendyol paketi ancak kurye "yola çıktım" dedikten sonra teslim edilebilir.
export function canDeliver(o: Order): boolean {
  return !isTy(o) || o.status === "on-the-way";
}

export async function deliverOrder(o: Order): Promise<Result> {
  if (isTy(o)) return deliverTrendyolCourierPackage(o.externalRef!, o.courier);
  return updateOrderStatus(o.id, "delivered", o.courier);
}

// Kuryenin üzerindeki paradan seçilen siparişleri kasaya teslim alındı yapar.
export async function handOverCash(courier: string, orders: CourierCashOrder[]): Promise<Result> {
  return handOverCourierCash({ courier, refs: orders.map((o) => ({ source: o.source, ref: o.ref })) });
}
