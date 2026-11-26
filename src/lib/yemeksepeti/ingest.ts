import { connectDB } from "@/lib/mongodb";
import YemeksepetiOrderModel from "@/models/YemeksepetiOrder";
import YemeksepetiCaptureModel from "@/models/YemeksepetiCapture";
import { notifyOrdersChanged } from "@/lib/pusher/server";
import { queueYemeksepetiStations } from "@/lib/printAgent/stations";

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

function parseBody(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

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

// Canlı sipariş (vendor-api …/deliveries/{oma_id} ve deliveries-web listesi).
// externalId = geçmişteki orderId ("oa7z-2648-loqm") → aynı kayda birleşir.
// Müşteri adı/telefon/adres SADECE burada gelir.
const TRANSPORT_TYPE: Record<string, string> = {
  RESTAURANT_DELIVERY: "vendor_delivery",
  PICKUP: "pickup",
  VENDOR_DELIVERY: "vendor_delivery",
};

function isLiveOrder(o: unknown): o is Obj {
  return isObj(o) && typeof o.externalId === "string" && (isObj(o.customer) || isObj(o.payment));
}

function liveUpdate(o: Obj, seenAt: Date) {
  const customer = isObj(o.customer) ? o.customer : {};
  const addr = isObj(o.address) ? o.address : {};
  const pay = isObj(o.payment) ? o.payment : {};
  const set: Obj = { lastSeenAt: new Date(), liveSeenAt: seenAt };
  const put = (k: string, v: unknown) => {
    if (v !== undefined) set[k] = v;
  };

  put("liveId", str(o.id));
  put("liveState", str(o.state)); // NEW | ACCEPTED | CLOSED | CANCELLED ...
  put("shortCode", str(o.shortCode));
  put("vendorId", str(o.externalRestaurantId));
  put("placedAt", date(o.timestamp));
  put("acceptedAt", date(o.acceptedAt));
  put("promisedAt", date(o.promisedTime));
  put("dispatchedAt", date(dig(o, "transport", "dispatchedAt")));
  const transport = str(dig(o, "transport", "type"));
  if (transport) set.deliveryType = TRANSPORT_TYPE[transport] ?? transport.toLowerCase();
  if (typeof o.preorder === "boolean") set.preorder = o.preorder;
  put("comment", str(o.comment));

  put("customerId", str(customer.customerId));
  const fullName = [str(customer.firstName), str(customer.lastName)].filter(Boolean).join(" ").trim();
  if (fullName) set.customerName = fullName;
  put("customerPhone", str(customer.phone));

  set.address = {
    street: str(addr.street) ?? "",
    building: str(addr.building) ?? "",
    buildingName: str(addr.buildingName) ?? "",
    floor: str(addr.floor) ?? "",
    entrance: str(addr.entrance) ?? "",
    area: str(addr.area) ?? "",
    info: str(addr.info) ?? "",
    lat: num(addr.latitude),
    lng: num(addr.longitude),
  };
  put("city", str(addr.city));
  put("postCode", str(addr.zip));

  put("subtotal", num(pay.itemsTotalPrice));
  put("customerTotal", num(pay.total));
  put("paymentType", str(pay.paymentType)); // ONLINE | CASH ...
  put("paymentLabel", str(pay.paymentMethod)); // "Online Kredi/Banka Kartı"
  if (typeof pay.paid === "boolean") set.paid = pay.paid;
  const change = num(pay.provideChangeFor);
  if (change) set.provideChangeFor = change;

  if (Array.isArray(o.discounts)) {
    let total = 0;
    let vendor = 0;
    for (const d of o.discounts.filter(isObj)) {
      total += Math.abs(num(d.value) ?? 0);
      if (Array.isArray(d.sponsorships)) {
        for (const sp of d.sponsorships.filter(isObj)) {
          if (str(sp.sponsor) === "VENDOR") vendor += Math.abs(num(sp.amount) ?? 0);
        }
      }
    }
    set.discountTotal = round2(total);
    set.vendorDiscount = round2(vendor);
  }

  // Ayrı alan: geçmiş detayındaki (opsiyonlu) `lines` ezilmesin.
  if (Array.isArray(o.items)) {
    set.liveLines = o.items.filter(isObj).map((it) => {
      const subs = [it.toppings, it.options, it.subItems].find(Array.isArray) as unknown[] | undefined;
      return {
        productId: str(it.productId),
        name: str(it.name) ?? "",
        quantity: num(it.amount) ?? num(it.quantity) ?? 1,
        unitPrice: num(it.price) ?? num(it.unitPrice) ?? 0,
        note: str(it.comment) ?? str(it.customerNotes) ?? "",
        options: subs
          ? subs.filter(isObj).map((op) => ({
              name: str(op.name) ?? "",
              quantity: num(op.amount) ?? num(op.quantity) ?? 1,
              unitPrice: num(op.price) ?? num(op.unitPrice) ?? 0,
            }))
          : undefined,
      };
    });
  }
  return set;
}

/**
 * Eklentiden gelen yakalamaları işler. Bilinen formatlar YemeksepetiOrder'a
 * yazılır; tanınmayan canlı yanıtlar ham saklanır (3 gün).
 */
export function parseCaptures(captures: YsCapture[]) {
  const ops: Parameters<typeof YemeksepetiOrderModel.bulkWrite>[0] = [];
  const raw: Obj[] = [];
  // Aynı canlı sipariş bir partide birkaç kez gelir (GET, PUT /state, liste);
  // sadece en yenisi yazılır ki durum geri gitmesin.
  const live = new Map<string, { at: number; o: Obj }>();
  let ignored = 0;

  for (const c of captures) {
    const url = String(c.url ?? "");
    // Eklenti gövdeyi ham metin (JSON string) olarak yollar; popup'tan
    // indirilen dosyada ise çözülmüş nesne olur. İkisini de kabul et.
    const body = parseBody(c.body);

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

    // Canlı siparişler — tek sipariş (api/1/deliveries/{id}) veya liste
    // (api/2/deliveries-web). Boş liste (kapalıyken) atlanır.
    if (url.includes("deliveries")) {
      const items = Array.isArray(body) ? body : [body];
      if (Array.isArray(body) && body.length === 0) {
        ignored++;
        continue;
      }
      if (items.every(isLiveOrder)) {
        const at = typeof c.at === "number" ? c.at : Date.now();
        for (const o of items as Obj[]) {
          const orderId = o.externalId as string;
          const prev = live.get(orderId);
          if (!prev || prev.at <= at) live.set(orderId, { at, o });
        }
        continue;
      }
      raw.push({
        kind: c.kind,
        url: url.slice(0, 1000),
        method: c.method,
        status: c.status,
        body,
        capturedAt: typeof c.at === "number" ? new Date(c.at) : new Date(),
      });
      continue;
    }

    ignored++;
  }
  for (const [orderId, { at, o }] of live) {
    ops.push({
      updateOne: {
        filter: { orderId },
        update: { $set: liveUpdate(o, new Date(at)) },
        upsert: true,
      },
    });
  }
  return { ops, raw, ignored, live: live.size, liveIds: [...live.keys()] };
}

export async function ingestCaptures(captures: YsCapture[]): Promise<IngestResult> {
  const { ops, raw, ignored, live, liveIds } = parseCaptures(captures);
  if (!ops.length && !raw.length) return { orders: 0, raw: 0, ignored };
  await connectDB();
  if (ops.length) await YemeksepetiOrderModel.bulkWrite(ops, { ordered: false });
  if (raw.length) await YemeksepetiCaptureModel.insertMany(raw, { ordered: false });
  // Canlı sipariş geldi/değişti → panel ve kurye ekranları anında tazelensin.
  // (Eklenti değişmeyen yanıtı tekrar göndermediği için bu sadece değişiklikte olur.)
  if (live > 0) await notifyOrdersChanged("yemeksepeti-live").catch(() => {});
  // Mutfak istasyonları açıksa yeni canlı siparişin ocak/fırın fişleri (bir kez).
  if (live > 0) {
    await queueYemeksepetiStations(liveIds).catch((err) => console.error("[ys stations]", err));
  }
  return { orders: ops.length, raw: raw.length, ignored };
}
