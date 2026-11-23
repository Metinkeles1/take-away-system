"use server";

// Yemeksepeti siparişlerinin kurye/panel işlemleri. Trendyol'daki
// trendyolCourier.ts ile AYNI imzalar (ref = orderId, ör. "oa7z-2648-loqm") →
// kurye ekranı ve panel kaynağa göre doğru fonksiyonu seçer, gerisi ortak.
//
// Fark: Yemeksepeti'ye geri yazma YOK (API yok, eklenti sadece okur). Üstlenme,
// "Yola çıktım" ve "Teslim" yalnızca bizim kaydımıza (YemeksepetiOrder) işlenir.
// Yemeksepeti panelindeki kabul/yola çıktı adımlarını kasadaki kişi yapar.

import { after } from "next/server";
import { connectDB } from "@/lib/mongodb";
import YemeksepetiOrderModel from "@/models/YemeksepetiOrder";
import { notifyOrdersChanged } from "@/lib/pusher/server";
import { istanbulDayStart } from "@/lib/datetime";
import { queueDispatch } from "@/lib/yemeksepeti/dispatch";
import { isYsCancelled, ysDocToOrder, YS_ORDER_FIELDS, type YsOrderDoc } from "@/lib/yemeksepeti/toOrder";
import type { Order } from "@/types";

type Result = { ok: boolean; error?: string; takenBy?: string };

// Kurye ekranında en fazla bu kadar eski sipariş görünür — kimse "Teslim"e
// basmasa bile ertesi güne sarkmasın (Trendyol'daki 12 saatlik TTL'in karşılığı).
const ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000;
// Kabul edilmemiş (NEW) sipariş bu süredir güncellenmiyorsa (reddedildi/zaman
// aşımı ama iptal yanıtı gelmedi) listede tutma.
const NEW_STALE_MS = 15 * 60 * 1000;

const notify = (reason: string) => after(() => notifyOrdersChanged(reason));

// Kurye ekranı + panel için aktif Yemeksepeti siparişleri (sadece Mongo okur).
// Canlı kaydı olan (müşteri/adres bilinen), teslim edilmemiş, iptal olmamış.
export async function getActiveYemeksepetiOrders(): Promise<Order[]> {
  try {
    await connectDB();
    const now = Date.now();
    const docs = await YemeksepetiOrderModel.find({
      liveId: { $exists: true },
      deliveredAt: { $exists: false },
      placedAt: { $gte: new Date(now - ACTIVE_WINDOW_MS) },
    })
      .select({ ...YS_ORDER_FIELDS, liveSeenAt: 1 })
      .sort({ placedAt: 1 })
      .lean<(YsOrderDoc & { liveSeenAt?: Date })[]>();

    return docs
      .filter((d) => !isYsCancelled(d))
      .filter(
        (d) =>
          d.liveState !== "NEW" ||
          (d.liveSeenAt && now - new Date(d.liveSeenAt).getTime() < NEW_STALE_MS),
      )
      .map(ysDocToOrder);
  } catch (err) {
    console.warn("[yemeksepeti active read]", err);
    return [];
  }
}

// Sipariş geçmişi (/orders) — salt okunur liste.
export async function getYemeksepetiOrdersForList(
  period: "today" | "week" | "month" | "all" = "week",
): Promise<Order[]> {
  try {
    await connectDB();
    const cutoff =
      period === "all"
        ? null
        : period === "today"
          ? istanbulDayStart()
          : new Date(Date.now() - (period === "week" ? 7 : 30) * 24 * 60 * 60 * 1000);
    const docs = await YemeksepetiOrderModel.find(
      cutoff ? { placedAt: { $gte: cutoff } } : { placedAt: { $exists: true } },
    )
      .select(YS_ORDER_FIELDS)
      .sort({ placedAt: -1 })
      .limit(2000)
      .lean<YsOrderDoc[]>();
    return docs.map((d) => ({ ...ysDocToOrder(d), id: `ysarch-${d.orderId}` }));
  } catch (err) {
    console.warn("[yemeksepeti list]", err);
    return [];
  }
}

const freeFilter = { $or: [{ courier: { $exists: false } }, { courier: null }, { courier: "" }] };

export async function claimYemeksepetiOrder(orderId: string, courier: string): Promise<Result> {
  try {
    const name = courier.trim();
    if (!name) return { ok: false, error: "Kurye adı gerekli" };
    await connectDB();
    const doc = await YemeksepetiOrderModel.findOneAndUpdate(
      { orderId, $or: [...freeFilter.$or, { courier: name }] },
      { $set: { courier: name } },
    ).lean();
    if (!doc) {
      const cur = await YemeksepetiOrderModel.findOne({ orderId }).select({ courier: 1 }).lean();
      const takenBy = cur?.courier ?? undefined;
      return { ok: false, error: takenBy ? `${takenBy} bu paketi aldı` : "Paket bulunamadı", takenBy };
    }
    notify("yemeksepeti-claimed");
    return { ok: true };
  } catch (err) {
    console.error("[claimYemeksepetiOrder]", err);
    return { ok: false, error: "Paket alınamadı" };
  }
}

export async function takeOverYemeksepetiOrder(
  orderId: string,
  courier: string,
  from: string,
): Promise<Result> {
  try {
    const name = courier.trim();
    if (!name) return { ok: false, error: "Kurye adı gerekli" };
    await connectDB();
    const doc = await YemeksepetiOrderModel.findOneAndUpdate(
      { orderId, courier: from },
      { $set: { courier: name } },
    ).lean();
    if (!doc) {
      const cur = await YemeksepetiOrderModel.findOne({ orderId }).select({ courier: 1 }).lean();
      if (!cur) return { ok: false, error: "Paket bulunamadı" };
      return { ok: false, error: "Paket el değiştirdi", takenBy: cur.courier ?? undefined };
    }
    notify("yemeksepeti-taken-over");
    return { ok: true };
  } catch (err) {
    console.error("[takeOverYemeksepetiOrder]", err);
    return { ok: false, error: "Paket devralınamadı" };
  }
}

export async function unclaimYemeksepetiOrder(orderId: string, courier: string): Promise<Result> {
  try {
    await connectDB();
    const doc = await YemeksepetiOrderModel.findOneAndUpdate(
      { orderId, courier: courier.trim() },
      { $unset: { courier: "" } },
    );
    if (!doc) return { ok: false, error: "Bu paketi sen almamışsın" };
    notify("yemeksepeti-unclaimed");
    return { ok: true };
  } catch (err) {
    console.error("[unclaimYemeksepetiOrder]", err);
    return { ok: false, error: "Paket bırakılamadı" };
  }
}

export async function claimManyYemeksepetiOrders(
  orderIds: string[],
  courier: string,
): Promise<{ ok: boolean; error?: string; claimed?: number }> {
  try {
    const name = courier.trim();
    if (!name || orderIds.length === 0) return { ok: true, claimed: 0 };
    await connectDB();
    const res = await YemeksepetiOrderModel.updateMany(
      { orderId: { $in: orderIds }, ...freeFilter },
      { $set: { courier: name } },
    );
    if (res.modifiedCount > 0) notify("yemeksepeti-claimed-bulk");
    return { ok: true, claimed: res.modifiedCount };
  } catch (err) {
    console.error("[claimManyYemeksepetiOrders]", err);
    return { ok: false, error: "Paketler alınamadı" };
  }
}

// "Yola çıktım" — kendi kaydımız + otomatik "yola çıktı" kuyruğu: kasadaki
// eklenti Yemeksepeti'ye iletir (bkz. lib/yemeksepeti/dispatch.ts). İletilemezse
// Ayarlar → Yemeksepeti Köprüsü kayıtlarında görünür.
export async function shipYemeksepetiOrder(orderId: string, courier?: string): Promise<Result> {
  try {
    await connectDB();
    const name = courier?.trim();
    const res = await YemeksepetiOrderModel.updateOne(
      { orderId },
      { $set: { shippedAt: new Date(), ...(name ? { courier: name } : {}) } },
    );
    if (res.matchedCount === 0) return { ok: false, error: "Sipariş bulunamadı" };
    after(() => queueDispatch(orderId).catch((e) => console.warn("[ys dispatch queue]", e)));
    notify("yemeksepeti-shipped");
    return { ok: true };
  } catch (err) {
    console.error("[shipYemeksepetiOrder]", err);
    return { ok: false, error: "Yola çıkış kaydedilemedi" };
  }
}

// "Teslim" — teslim eden kurye + süre kaydedilir, kurye ekranından düşer.
export async function deliverYemeksepetiOrder(orderId: string, courier?: string): Promise<Result> {
  try {
    await connectDB();
    const doc = await YemeksepetiOrderModel.findOne({ orderId })
      .select({ placedAt: 1, courier: 1, shippedAt: 1, dispatchStatus: 1 })
      .lean();
    if (!doc) return { ok: false, error: "Sipariş bulunamadı" };
    const now = new Date();
    const name = courier?.trim() || doc.courier?.trim() || undefined;
    const duration = doc.placedAt
      ? Math.round(((now.getTime() - new Date(doc.placedAt).getTime()) / 60000) * 10) / 10
      : undefined;
    await YemeksepetiOrderModel.updateOne(
      { orderId },
      {
        $set: {
          deliveredAt: now,
          ...(doc.shippedAt ? {} : { shippedAt: now }),
          ...(name ? { courier: name, deliveredBy: name } : {}),
          ...(duration != null && duration >= 0 ? { deliveryDurationMin: duration } : {}),
        },
      },
    );
    // "Yola çıktım" atlanıp doğrudan teslim edildiyse Yemeksepeti'ye yine bildir.
    if (!doc.dispatchStatus) {
      after(() => queueDispatch(orderId).catch((e) => console.warn("[ys dispatch queue]", e)));
    }
    notify("yemeksepeti-delivered");
    return { ok: true };
  } catch (err) {
    console.error("[deliverYemeksepetiOrder]", err);
    return { ok: false, error: "Teslim kaydedilemedi" };
  }
}
