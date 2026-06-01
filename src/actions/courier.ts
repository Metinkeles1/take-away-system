"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import { type Order } from "@/types";

// Kurye sayfası için teslim edilmesi gereken siparişler.
// Sadece aktif (teslim/iptal olmamış) siparişleri döner — public sayfa olduğu
// için tüm geçmişi taşımayız, en yeni en üstte.
export async function getCourierOrders(): Promise<Order[]> {
  await connectDB();

  const docs = await OrderModel.find({
    status: { $in: ["pending", "preparing", "on-the-way"] },
  })
    .sort({ createdAt: -1 })
    .lean();

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
