"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import TrendyolOrderModel from "@/models/TrendyolOrder";
import CashHandoverModel from "@/models/CashHandover";
import SettingModel from "@/models/Setting";
import { notifyOrdersChanged } from "@/lib/pusher/server";
import { istanbulDayStart } from "@/lib/datetime";
import { generateId } from "@/lib/orders/factory";

// ─── Kuryedeki para ─────────────────────────────────────────────────────────
// Kapıda alınan (nakit + kapıda kart) ve henüz kasaya teslim edilmemiş para,
// kurye bazında. Kaynaklar: yerel siparişler (Order) + kurye ekranından teslim
// edilen Trendyol "kapıda ödeme" paketleri (TrendyolOrder arşivi).
// Açık hesaba yazılan siparişler dahil değil (para alınmadı).

const ALERT_KEY = "cashAlert";
const START_KEY = "cashHandoverStartAt";
// Kurye adı yazılmadan teslim edilen siparişler bu anahtarla gruplanır.
const UNASSIGNED = "";

export interface CashAlertSettings {
  amount: number; // kuryedeki nakit bu tutarı geçince uyar (TL)
  minutes: number; // en eski teslim edilmemiş para bu süreyi geçince uyar (dk)
}

const DEFAULT_ALERT: CashAlertSettings = { amount: 1500, minutes: 120 };

export interface CourierCashOrder {
  source: "manual" | "trendyol";
  ref: string; // Order.id | TrendyolOrder.orderNumber
  orderNumber: string;
  method: "cash" | "card";
  amount: number;
  deliveredAt: string; // ISO
  customer: string;
}

export interface CourierCashRow {
  courier: string; // "" = kurye belirtilmemiş
  cash: number;
  card: number;
  orderCount: number;
  oldestAt: string; // ISO — en eski teslim edilmemiş siparişin teslim anı
  orders: CourierCashOrder[];
}

export interface CashHandoverRecord {
  id: string;
  courier: string;
  expectedCash: number;
  expectedCard: number;
  orderCount: number;
  countedCash: number | null;
  cashDiff: number;
  note?: string;
  at: string; // ISO
}

export interface CourierCashState {
  rows: CourierCashRow[];
  alert: CashAlertSettings;
  totalCash: number;
  totalCard: number;
}

// Takibin başladığı an. İlk kullanımda o günün başına sabitlenir; böylece
// geçmişteki (zaten teslim edilmiş) siparişler "kuryede" görünmez.
async function trackingStart(): Promise<Date> {
  const doc = await SettingModel.findOneAndUpdate(
    { key: START_KEY },
    { $setOnInsert: { value: istanbulDayStart().toISOString() } },
    { upsert: true, returnDocument: "after" },
  )
    .select("value")
    .lean();
  const raw = (doc as unknown as { value?: string })?.value;
  const d = raw ? new Date(raw) : istanbulDayStart();
  return Number.isNaN(d.getTime()) ? istanbulDayStart() : d;
}

async function readAlert(): Promise<CashAlertSettings> {
  const doc = await SettingModel.findOne({ key: ALERT_KEY }).select("value").lean();
  const v = (doc as unknown as { value?: Partial<CashAlertSettings> })?.value;
  const amount = Number(v?.amount);
  const minutes = Number(v?.minutes);
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : DEFAULT_ALERT.amount,
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_ALERT.minutes,
  };
}

// Teslim edilmemiş siparişler — courier verilirse yalnız o kurye.
type PendingOrder = CourierCashOrder & { courier: string };

async function pendingOrders(courier?: string): Promise<PendingOrder[]> {
  const start = await trackingStart();
  const courierFilter =
    courier === undefined
      ? {}
      : courier === UNASSIGNED
        ? { courier: { $in: [null, ""] } }
        : { courier };

  const [manual, trendyol] = await Promise.all([
    OrderModel.find({
      status: "delivered",
      source: { $ne: "trendyol" },
      "payment.method": { $in: ["cash", "card"] },
      paymentStatus: { $ne: "open" },
      deliveredAt: { $gte: start },
      handedOverAt: { $exists: false },
      ...courierFilter,
    })
      .select({ id: 1, orderNumber: 1, total: 1, payment: 1, deliveredAt: 1, courier: 1, customer: 1 })
      .lean(),
    TrendyolOrderModel.find({
      deliveryType: "STORE",
      deliveryTimeSource: "courier",
      paymentKey: { $in: ["cash", "card"] },
      deliveredAt: { $gte: start },
      handedOverAt: { $exists: false },
      ...courierFilter,
    })
      .select({ orderNumber: 1, netTotal: 1, paymentKey: 1, deliveredAt: 1, courier: 1, customerName: 1, neighborhood: 1 })
      .lean(),
  ]);

  const out: PendingOrder[] = [];
  for (const o of manual) {
    const c = o.customer as { name?: string; address?: string } | undefined;
    out.push({
      source: "manual",
      ref: o.id,
      orderNumber: String(o.orderNumber),
      method: o.payment?.method === "card" ? "card" : "cash",
      amount: o.total ?? 0,
      deliveredAt: (o.deliveredAt ?? new Date()).toISOString(),
      customer: c?.address || c?.name || "",
      courier: o.courier?.trim() || UNASSIGNED,
    });
  }
  for (const t of trendyol) {
    out.push({
      source: "trendyol",
      ref: t.orderNumber,
      orderNumber: t.orderNumber,
      method: t.paymentKey === "card" ? "card" : "cash",
      amount: t.netTotal ?? 0,
      deliveredAt: (t.deliveredAt ?? new Date()).toISOString(),
      customer: [t.customerName, t.neighborhood].filter(Boolean).join(" · "),
      courier: t.courier?.trim() || UNASSIGNED,
    });
  }
  return out;
}

export async function getCourierCash(): Promise<CourierCashState> {
  try {
    await connectDB();
    const [orders, alert] = await Promise.all([pendingOrders(), readAlert()]);

    const map = new Map<string, CourierCashRow>();
    for (const o of orders) {
      const { courier, ...order } = o;
      let row = map.get(courier);
      if (!row) {
        row = { courier, cash: 0, card: 0, orderCount: 0, oldestAt: order.deliveredAt, orders: [] };
        map.set(courier, row);
      }
      if (order.method === "cash") row.cash += order.amount;
      else row.card += order.amount;
      row.orderCount++;
      if (order.deliveredAt < row.oldestAt) row.oldestAt = order.deliveredAt;
      row.orders.push(order);
    }

    const rows = [...map.values()]
      .map((r) => ({
        ...r,
        orders: r.orders.sort((a, b) => a.deliveredAt.localeCompare(b.deliveredAt)),
      }))
      .sort((a, b) => b.cash - a.cash || b.card - a.card);

    return {
      rows,
      alert,
      totalCash: rows.reduce((s, r) => s + r.cash, 0),
      totalCard: rows.reduce((s, r) => s + r.card, 0),
    };
  } catch (error) {
    console.error("[getCourierCash]", error);
    return { rows: [], alert: DEFAULT_ALERT, totalCash: 0, totalCard: 0 };
  }
}

// Verilen (hâlâ teslim edilmemiş) siparişleri tek teslim kaydına bağlar.
async function recordHandover(
  courier: string,
  pending: PendingOrder[],
  countedCash?: number | null,
  note?: string,
): Promise<CashHandoverRecord> {
  const expectedCash = pending.filter((o) => o.method === "cash").reduce((s, o) => s + o.amount, 0);
  const expectedCard = pending.filter((o) => o.method === "card").reduce((s, o) => s + o.amount, 0);
  const counted =
    countedCash != null && Number.isFinite(countedCash) && countedCash >= 0
      ? Math.round(countedCash * 100) / 100
      : null;
  const now = new Date();
  const id = generateId();

  const manualIds = pending.filter((o) => o.source === "manual").map((o) => o.ref);
  const tyNumbers = pending.filter((o) => o.source === "trendyol").map((o) => o.ref);
  const mark = { $set: { handedOverAt: now, handoverId: id } };
  await Promise.all([
    manualIds.length
      ? OrderModel.updateMany({ id: { $in: manualIds }, handedOverAt: { $exists: false } }, mark)
      : null,
    tyNumbers.length
      ? TrendyolOrderModel.updateMany(
          { orderNumber: { $in: tyNumbers }, handedOverAt: { $exists: false } },
          mark,
        )
      : null,
  ]);

  const doc = {
    id,
    courier: courier || "Kurye belirtilmemiş",
    expectedCash,
    expectedCard,
    orderCount: pending.length,
    countedCash: counted ?? undefined,
    cashDiff: counted == null ? 0 : Math.round((counted - expectedCash) * 100) / 100,
    note: note?.trim() || undefined,
    at: now,
  };
  await CashHandoverModel.create(doc);
  return { ...doc, countedCash: counted, at: now.toISOString() };
}

// "Teslim aldım": kuryenin ekranda görünen siparişlerini kasaya teslim edildi
// olarak işaretler. refs, yöneticinin gördüğü listedir — tam o anda teslim
// edilen yeni bir sipariş yanlışlıkla kapsanmasın diye sunucu yalnız bunları işler.
export async function handOverCourierCash(input: {
  courier: string;
  refs: { source: "manual" | "trendyol"; ref: string }[];
  countedCash?: number | null;
  note?: string;
}): Promise<{ ok: boolean; error?: string; record?: CashHandoverRecord }> {
  try {
    await connectDB();

    const wanted = new Set(input.refs.map((r) => `${r.source}:${r.ref}`));
    const pending = (await pendingOrders(input.courier)).filter((o) =>
      wanted.has(`${o.source}:${o.ref}`),
    );
    if (pending.length === 0) {
      return { ok: false, error: "Teslim edilecek para kalmamış (başka ekrandan alınmış olabilir)" };
    }

    const record = await recordHandover(input.courier, pending, input.countedCash, input.note);

    revalidatePath("/gun-sonu");
    await notifyOrdersChanged("cash-handover");

    return { ok: true, record };
  } catch (error) {
    console.error("[handOverCourierCash]", error);
    return { ok: false, error: "Teslim kaydedilemedi" };
  }
}

// "Hepsini teslim aldım": ekrandaki tüm siparişler, kurye başına ayrı kayıt.
export async function handOverAllCourierCash(
  refs: { source: "manual" | "trendyol"; ref: string }[],
): Promise<{ ok: boolean; error?: string; count?: number; cash?: number; card?: number }> {
  try {
    await connectDB();
    const wanted = new Set(refs.map((r) => `${r.source}:${r.ref}`));
    const pending = (await pendingOrders()).filter((o) => wanted.has(`${o.source}:${o.ref}`));
    if (pending.length === 0) {
      return { ok: false, error: "Teslim edilecek para kalmamış (başka ekrandan alınmış olabilir)" };
    }
    const byCourier = new Map<string, PendingOrder[]>();
    for (const o of pending) byCourier.set(o.courier, [...(byCourier.get(o.courier) ?? []), o]);
    const records = [];
    for (const [courier, list] of byCourier) records.push(await recordHandover(courier, list));

    revalidatePath("/gun-sonu");
    await notifyOrdersChanged("cash-handover");
    return {
      ok: true,
      count: pending.length,
      cash: records.reduce((s, r) => s + r.expectedCash, 0),
      card: records.reduce((s, r) => s + r.expectedCard, 0),
    };
  } catch (error) {
    console.error("[handOverAllCourierCash]", error);
    return { ok: false, error: "Teslim kaydedilemedi" };
  }
}

// Teslim geçmişi — en yeniler üstte.
export async function getCashHandovers(limit = 50): Promise<CashHandoverRecord[]> {
  try {
    await connectDB();
    const docs = await CashHandoverModel.find()
      .sort({ at: -1 })
      .limit(Math.min(200, Math.max(1, limit)))
      .lean();
    return docs.map((d) => ({
      id: d.id,
      courier: d.courier,
      expectedCash: d.expectedCash ?? 0,
      expectedCard: d.expectedCard ?? 0,
      orderCount: d.orderCount ?? 0,
      countedCash: d.countedCash ?? null,
      cashDiff: d.cashDiff ?? 0,
      note: d.note ?? undefined,
      at: new Date(d.at).toISOString(),
    }));
  } catch (error) {
    console.error("[getCashHandovers]", error);
    return [];
  }
}

export async function getCashAlertSettings(): Promise<CashAlertSettings> {
  try {
    await connectDB();
    return await readAlert();
  } catch (error) {
    console.error("[getCashAlertSettings]", error);
    return DEFAULT_ALERT;
  }
}

export async function setCashAlertSettings(
  input: CashAlertSettings,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const amount = Math.round(Number(input.amount));
    const minutes = Math.round(Number(input.minutes));
    if (!Number.isFinite(amount) || amount < 100 || amount > 100_000) {
      return { ok: false, error: "Tutar 100–100.000 TL arasında olmalı" };
    }
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 1440) {
      return { ok: false, error: "Süre 15–1440 dk arasında olmalı" };
    }
    await connectDB();
    await SettingModel.updateOne(
      { key: ALERT_KEY },
      { $set: { value: { amount, minutes } } },
      { upsert: true },
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[setCashAlertSettings]", error);
    return { ok: false, error: "Uyarı ayarı kaydedilemedi" };
  }
}

// Kurye ekranı için: yalnız bu kuryenin üzerindeki para + uyarı eşikleri.
export async function getMyCourierCash(courier: string): Promise<{
  cash: number;
  card: number;
  orderCount: number;
  oldestCashAt: string | null;
  alert: CashAlertSettings;
}> {
  const empty = { cash: 0, card: 0, orderCount: 0, oldestCashAt: null, alert: DEFAULT_ALERT };
  const name = courier.trim();
  if (!name) return empty;
  try {
    await connectDB();
    const [orders, alert] = await Promise.all([pendingOrders(name), readAlert()]);
    const cashOrders = orders.filter((o) => o.method === "cash");
    return {
      cash: cashOrders.reduce((s, o) => s + o.amount, 0),
      card: orders.filter((o) => o.method === "card").reduce((s, o) => s + o.amount, 0),
      orderCount: orders.length,
      oldestCashAt: cashOrders.length
        ? cashOrders.reduce((m, o) => (o.deliveredAt < m ? o.deliveredAt : m), cashOrders[0].deliveredAt)
        : null,
      alert,
    };
  } catch (error) {
    console.error("[getMyCourierCash]", error);
    return empty;
  }
}
