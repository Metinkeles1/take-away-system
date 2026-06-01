"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import { notifyOrdersChanged } from "@/lib/pusher/server";
import { type CustomerInfo, type OrderItem } from "@/types";

interface UpdateOrderDetailsInput {
  items: OrderItem[];
  customer: CustomerInfo;
  notes?: string;
}

// Manuel oluşturulan siparişlerin kalem/müşteri/not bilgisini günceller.
// Status ve payment için ayrı action'lar var (updateOrderStatus, updateOrderPayment).
export async function updateOrderDetails(
  id: string,
  input: UpdateOrderDetailsInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    const existing = await OrderModel.findOne({ id });
    if (!existing) return { ok: false, error: "Sipariş bulunamadı" };

    if (existing.source && existing.source !== "manual") {
      return {
        ok: false,
        error: "Yalnızca manuel siparişler düzenlenebilir",
      };
    }

    if (input.items.length === 0) {
      return { ok: false, error: "Sipariş en az bir ürün içermelidir" };
    }

    if (!input.customer.phone || !input.customer.address) {
      return { ok: false, error: "Telefon ve adres zorunludur" };
    }

    const subtotal = input.items.reduce((sum, i) => sum + i.totalPrice, 0);
    const deliveryFee = existing.deliveryFee ?? 0;
    const total = subtotal + deliveryFee;

    await OrderModel.findOneAndUpdate(
      { id },
      {
        items: input.items,
        customer: input.customer,
        notes: input.notes ?? "",
        subtotal,
        total,
      },
    );

    revalidatePath("/orders");
    revalidatePath(`/orders/${id}`);
    // Düzenleme de gerçek zamanlı yayılsın (diğer sekme/cihazlar anlık görsün).
    await notifyOrdersChanged("order-edited");

    return { ok: true };
  } catch (error) {
    console.error("[updateOrderDetails]", error);
    return { ok: false, error: "Sipariş güncellenemedi" };
  }
}
