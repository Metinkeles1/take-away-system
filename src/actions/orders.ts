"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import { type Order, type OrderStatus, type PaymentInfo } from "@/types";

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
    });

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
