import { connectDB } from "@/lib/mongodb";
import YemeksepetiOrderModel from "@/models/YemeksepetiOrder";
import YemeksepetiCaptureModel from "@/models/YemeksepetiCapture";

// Eklentiden gelen tek bir yakalama (panelin aldığı bir yanıt).
export type YsCapture = {
  kind?: string;
  url?: string;
  method?: string;
  status?: number;
  body?: unknown;
  at?: number;
};

export type IngestResult = { orders: number; raw: number; ignored: number };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const date = (v: unknown): Date | undefined => {
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

function dig(o: unknown, ...path: string[]): unknown {
  let cur = o;
  for (const p of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

// Geçmiş listesindeki özet satır → kısmi güncelleme.
function summaryUpdate(o: Obj) {
  const set: Obj = { lastSeenAt: new Date() };
  const put = (k: string, v: unknown) => {
    if (v !== undefined) set[k] = v;
  };
  put("vendorId", str(o.vendorId));
  put("status", str(o.orderStatus));
  put("deliveryType", str(o.deliveryType));
  put("placedAt", date(o.placedTimestamp));
  put("subtotal", num(o.subtotal));
  put("billableStatus", str(o.billableStatus));
  put("commissionAmount", num(dig(o, "billing", "commissionAmount")));
  put("netRevenue", num(dig(o, "billing", "netRevenue")));
  return set;
}

// Sipariş detayı (ürünler, ödeme, fatura kalemleri) → tam güncelleme.
function detailUpdate(res: Obj) {
  const order = isObj(res.order) ? res.order : {};
  const billing = isObj(res.billing) ? res.billing : {};
  const expense = isObj(billing.expense) ? billing.expense : {};
  const revenue = isObj(billing.revenue) ? billing.revenue : {};
  const loc = dig(order, "delivery", "location");

  const set: Obj = { lastSeenAt: new Date(), detailFetchedAt: new Date() };
  const put = (k: string, v: unknown) => {
    if (v !== undefined) set[k] = v;
  };

  put("vendorId", str(order.vendorId));
  put("status", str(order.status));
  put("placedAt", date(order.placedTimestamp));
  put("subtotal", num(order.orderValue));
  put("billableStatus", str(order.billableStatus));
  put("deliveryType", str(dig(order, "delivery", "provider")));
  if (isObj(loc)) {
    put("city", str(loc.city));
    put("district", str(loc.district));
    put("postCode", str(loc.postCode));
  }

  if (Array.isArray(order.items)) {
    set.lines = order.items.filter(isObj).map((it) => ({
      productId: str(it.id),
      name: str(it.name) ?? "",
      quantity: num(it.quantity) ?? 1,
      unitPrice: num(it.unitPrice) ?? 0,
      note: str(it.customerNotes) ?? "",
      options: Array.isArray(it.options)
        ? it.options.filter(isObj).map((op) => ({
            name: str(op.name) ?? "",
            quantity: num(op.quantity) ?? 1,
            unitPrice: num(op.unitPrice) ?? 0,
          }))
        : undefined,
    }));
  }

  if (Array.isArray(res.orderStatuses)) {
    set.statuses = res.orderStatuses
      .filter(isObj)
      .map((s) => ({ status: str(s.status), at: date(s.timestamp) }))
      .filter((s) => s.status && s.at);
  }

  put("billingStatus", str(billing.billingStatus));
  put("netRevenue", num(billing.estimatedVendorNetRevenue));
  put("paymentType", str(dig(billing, "payment", "paymentType")));
  put("paymentMethod", str(dig(billing, "payment", "method")));

  const commission = num(expense.commissionAmountGross);
  if (commission !== undefined) set.commissionAmount = round2(commission);
  const firstCommission = Array.isArray(expense.commissions) ? expense.commissions[0] : undefined;
  put("commissionRate", num(dig(firstCommission, "rate")));
  put("discountTotal", num(expense.totalDiscountGross));
  const vendorDiscount =
    (num(expense.totalVendorDiscount) ?? 0) + (num(expense.totalVendorVoucher) ?? 0);
  if (vendorDiscount) set.vendorDiscount = round2(vendorDiscount);
  put("jokerFee", num(expense.jokerFeeGross));
  put("marketingFee", num(dig(revenue, "marketingFees", "total")));
  put("taxTotal", num(dig(revenue, "taxCharges", "total")));
  return set;
}

/**
 * Eklentiden gelen yakalamaları işler. Bilinen formatlar YemeksepetiOrder'a
 * yazılır; canlı sipariş akışı (formatı henüz çözülmedi) ham saklanır.
 */
export async function ingestCaptures(captures: YsCapture[]): Promise<IngestResult> {
  await connectDB();
  const ops: Parameters<typeof YemeksepetiOrderModel.bulkWrite>[0] = [];
  const raw: Obj[] = [];
  let ignored = 0;

  for (const c of captures) {
    const url = String(c.url ?? "");
    const body = c.body;

    if (url.includes("graphql")) {
      const list = dig(body, "data", "orders", "listOrders", "orders");
      const detail = dig(body, "data", "orders", "order");
      if (Array.isArray(list)) {
        for (const o of list.filter(isObj)) {
          const orderId = str(o.orderId);
          if (!orderId) continue;
          ops.push({
            updateOne: { filter: { orderId }, update: { $set: summaryUpdate(o) }, upsert: true },
          });
        }
        continue;
      }
      if (isObj(detail)) {
        const orderId = str(dig(detail, "order", "orderId"));
        if (orderId) {
          ops.push({
            updateOne: { filter: { orderId }, update: { $set: detailUpdate(detail) }, upsert: true },
          });
          continue;
        }
      }
      ignored++;
      continue;
    }

    // Canlı siparişler — boş liste (kapalıyken) saklanmaz.
    if (url.includes("deliveries")) {
      const empty = Array.isArray(body) && body.length === 0;
      if (!empty) {
        raw.push({
          kind: c.kind,
          url: url.slice(0, 1000),
          method: c.method,
          status: c.status,
          body,
          capturedAt: typeof c.at === "number" ? new Date(c.at) : new Date(),
        });
      } else ignored++;
      continue;
    }

    ignored++;
  }

  if (ops.length) await YemeksepetiOrderModel.bulkWrite(ops, { ordered: false });
  if (raw.length) await YemeksepetiCaptureModel.insertMany(raw, { ordered: false });
  return { orders: ops.length, raw: raw.length, ignored };
}
