"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import {
  cancelTrendyolPackage,
  deliverTrendyolPackage,
  markTrendyolPackageInvoiced,
  shipTrendyolPackage,
} from "@/lib/integrations/trendyol/client";
import { type Order, type OrderStatus, type PaymentInfo } from "@/types";

// Dahili sipariş durumu → Trendyol GO Yemek API çağrı zinciri.
// "preparing" webhook'ta otomatik "picked" (kabul) atılırken yapılıyor — burada tekrarlanmaz.
//
// "on-the-way" : önce invoiced (hazırlık bitti) sonra manual-shipped (yola çıktı)
// "delivered"  : manual-delivered
// "cancelled"  : unsupplied
async function syncStatusToTrendyol(packageId: string, status: OrderStatus) {
  try {
    if (status === "cancelled") {
      const r = await cancelTrendyolPackage(packageId);
      if (!r.ok) console.warn("[trendyol cancel]", r.status, r.error);
      return;
    }
    if (status === "on-the-way") {
      // Trendyol akışına göre "manual-shipped" çağrılabilmesi için önce
      // "invoiced" (hazırlık bitti) statüsünden geçmek gerekir.
      const inv = await markTrendyolPackageInvoiced(packageId);
      if (!inv.ok) console.warn("[trendyol invoiced]", inv.status, inv.error);
      const ship = await shipTrendyolPackage(packageId);
      if (!ship.ok) console.warn("[trendyol manual-shipped]", ship.status, ship.error);
      return;
    }
    if (status === "delivered") {
      const r = await deliverTrendyolPackage(packageId);
      if (!r.ok) console.warn("[trendyol manual-delivered]", r.status, r.error);
      return;
    }
  } catch (err) {
    console.warn("[trendyol sync exception]", err);
  }
}

// ─── Tüm siparişleri getir ────────────────────────────────────────────────────
export async function getOrders(): Promise<Order[]> {
  await connectDB();

  const docs = await OrderModel.find().sort({ createdAt: -1 }).lean();

  return docs.map((doc) => ({
    id: doc.id,
    orderNumber: doc.orderNumber,
    items: doc.items as Order["items"],
    customer: doc.customer as Order["customer"],
    payment: doc.payment as Order["payment"],
    status: doc.status as Order["status"],
    notes: doc.notes ?? undefined,
    subtotal: doc.subtotal,
    deliveryFee: doc.deliveryFee,
    total: doc.total,
    source: (doc.source as Order["source"]) ?? "manual",
    externalRef: doc.externalRef ?? undefined,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
  }));
}

// ─── Tek sipariş getir ────────────────────────────────────────────────────────
export async function getOrderById(id: string): Promise<Order | null> {
  await connectDB();

  const doc = await OrderModel.findOne({ id }).lean();
  if (!doc) return null;

  return {
    id: doc.id,
    orderNumber: doc.orderNumber,
    items: doc.items as Order["items"],
    customer: doc.customer as Order["customer"],
    payment: doc.payment as Order["payment"],
    status: doc.status as Order["status"],
    notes: doc.notes ?? undefined,
    subtotal: doc.subtotal,
    deliveryFee: doc.deliveryFee,
    total: doc.total,
    source: (doc.source as Order["source"]) ?? "manual",
    externalRef: doc.externalRef ?? undefined,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
  };
}

// ─── Sipariş kaydet ───────────────────────────────────────────────────────────
export async function createOrder(
  order: Order,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    // ibanName ve ibanNumber DB'ye kaydedilmez, sadece UI'da (fiş) kullanılır
    const { ...paymentForDB } = order.payment;

    await OrderModel.create({
      id: order.id,
      orderNumber: order.orderNumber,
      items: order.items,
      customer: order.customer,
      payment: paymentForDB,
      status: order.status ?? "pending",
      notes: order.notes,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      source: order.source ?? "manual",
      externalRef: order.externalRef,
    });

    revalidatePath("/orders");

    return { ok: true };
  } catch (error) {
    console.error("[createOrder]", error);
    return { ok: false, error: "Sipariş kaydedilemedi" };
  }
}

// ─── Sipariş durumu güncelle ──────────────────────────────────────────────────
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    const doc = await OrderModel.findOneAndUpdate({ id }, { status });
    if (!doc) return { ok: false, error: "Sipariş bulunamadı" };

    // Trendyol kaynaklıysa durum değişikliğini Trendyol'a da bildir (best-effort).
    // MOCK-DEV-* lokal simülatör siparişleridir; outbound atlanır.
    if (
      doc.source === "trendyol" &&
      doc.externalRef &&
      !doc.externalRef.startsWith("MOCK-DEV-")
    ) {
      await syncStatusToTrendyol(doc.externalRef, status);
    }

    return { ok: true };
  } catch (error) {
    console.error("[updateOrderStatus]", error);
    return { ok: false, error: "Durum güncellenemedi" };
  }
}

// ─── Sipariş ödeme güncelle ───────────────────────────────────────────────────
export async function updateOrderPayment(
  id: string,
  payment: PaymentInfo,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    const doc = await OrderModel.findOneAndUpdate({ id }, { payment });
    if (!doc) return { ok: false, error: "Sipariş bulunamadı" };

    return { ok: true };
  } catch (error) {
    console.error("[updateOrderPayment]", error);
    return { ok: false, error: "Ödeme güncellenemedi" };
  }
}

// ─── Tüm aktif sipariş sayısı (sidebar rozeti için, hafif sorgu) ────────────
export async function getActiveOrdersCount(): Promise<number> {
  try {
    await connectDB();
    return await OrderModel.countDocuments({
      status: { $in: ["pending", "preparing", "on-the-way"] },
    });
  } catch (error) {
    console.error("[getActiveOrdersCount]", error);
    return 0;
  }
}

// ─── Aktif Trendyol siparişi sayısı (sidebar rozeti için, hafif sorgu) ───────
export async function getActiveTrendyolCount(): Promise<number> {
  try {
    await connectDB();
    return await OrderModel.countDocuments({
      source: "trendyol",
      status: { $in: ["pending", "preparing", "on-the-way"] },
    });
  } catch (error) {
    console.error("[getActiveTrendyolCount]", error);
    return 0;
  }
}

// ─── Son Trendyol siparişleri (global bildirim watcher'ı için) ───────────────
// Sadece yeni gelen siparişleri tespit etmek için minimum alan döner.
export async function getRecentTrendyolRefs(limit = 15): Promise<
  {
    externalRef: string;
    orderNumber: number;
    customerName: string;
    total: number;
  }[]
> {
  try {
    await connectDB();
    const docs = await OrderModel.find(
      { source: "trendyol", externalRef: { $exists: true, $ne: null } },
      { externalRef: 1, orderNumber: 1, "customer.name": 1, total: 1, _id: 0 },
    )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs.map((d) => ({
      externalRef: d.externalRef as string,
      orderNumber: d.orderNumber,
      customerName: d.customer?.name ?? "—",
      total: d.total,
    }));
  } catch (error) {
    console.error("[getRecentTrendyolRefs]", error);
    return [];
  }
}

// ─── Sipariş sil ─────────────────────────────────────────────────────────────
export async function deleteOrder(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();
    await OrderModel.findOneAndDelete({ id });
    return { ok: true };
  } catch (error) {
    console.error("[deleteOrder]", error);
    return { ok: false, error: "Sipariş silinemedi" };
  }
}
