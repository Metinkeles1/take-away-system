import { handOverCourierCash, type CourierCashOrder } from "@/actions/courierCash";
import { setOrderCourier } from "@/actions/courier";
import { updateOrderStatus } from "@/actions/orders";
import { platformOps } from "@/lib/orders/platform";
import type { Order } from "@/types";

// Panelden sipariş işlemleri — kendi siparişimiz ile pazaryeri (Trendyol /
// Yemeksepeti) siparişi farklı action'lara gider; kart bu ayrımı bilmesin diye
// burada toplanır.
type Result = { ok: boolean; error?: string };

const opsOf = (o: Order) => (o.externalRef ? platformOps(o) : null);

export async function assignCourier(o: Order, name: string): Promise<Result> {
  const ops = opsOf(o);
  if (ops) {
    return o.courier ? ops.takeOver(o.externalRef!, name, o.courier) : ops.claim(o.externalRef!, name);
  }
  // Kendi siparişimizde son söz yöneticide — doğrudan yazılır.
  return setOrderCourier(o.id, name);
}

export async function releaseCourier(o: Order): Promise<Result> {
  const ops = opsOf(o);
  if (ops) return o.courier ? ops.unclaim(o.externalRef!, o.courier) : { ok: true };
  return setOrderCourier(o.id, null);
}

// Pazaryeri siparişi ancak kurye "yola çıktım" dedikten sonra teslim edilebilir.
export function canDeliver(o: Order): boolean {
  return !opsOf(o) || o.status === "on-the-way";
}

export async function deliverOrder(o: Order): Promise<Result> {
  const ops = opsOf(o);
  if (ops) return ops.deliver(o.externalRef!, o.courier);
  return updateOrderStatus(o.id, "delivered", o.courier);
}

// Kuryenin üzerindeki paradan seçilen siparişleri kasaya teslim alındı yapar.
export async function handOverCash(courier: string, orders: CourierCashOrder[]): Promise<Result> {
  return handOverCourierCash({ courier, refs: orders.map((o) => ({ source: o.source, ref: o.ref })) });
}
