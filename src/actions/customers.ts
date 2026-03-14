"use server";

import { connectDB } from "@/lib/mongodb";
import CustomerModel from "@/models/Customer";
import { type SavedCustomer } from "@/types";

function docToCustomer(doc: Record<string, unknown>): SavedCustomer {
  return {
    id: doc.id as string,
    name: doc.name as string,
    phone: doc.phone as string,
    address: doc.address as string,
    addressDetail: doc.addressDetail as string | undefined,
    orderCount: doc.orderCount as number,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
  };
}

// ─── Tüm kayıtlı müşterileri getir (son siparişe göre sıralı) ────────────────
export async function getSavedCustomers(): Promise<SavedCustomer[]> {
  await connectDB();
  const docs = await CustomerModel.find().sort({ updatedAt: -1 }).lean();
  return docs.map((d) => docToCustomer(d as Record<string, unknown>));
}

// ─── Müşteri kaydet / güncelle (phone üzerinden upsert) ──────────────────────
export async function upsertCustomer(
  customer: Omit<SavedCustomer, "orderCount" | "updatedAt">,
): Promise<void> {
  await connectDB();

  await CustomerModel.findOneAndUpdate(
    { phone: customer.phone },
    {
      $set: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        addressDetail: customer.addressDetail,
      },
      $inc: { orderCount: 1 },
    },
    { upsert: true, new: true },
  );
}

// ─── İsim, telefon veya adrese göre ara ──────────────────────────────────────────────
export async function searchCustomers(query: string): Promise<SavedCustomer[]> {
  await connectDB();
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");

  const docs = await CustomerModel.find({
    $or: [{ address: regex }, { name: regex }, { phone: regex }],
  })
    .sort({ updatedAt: -1 })
    .limit(8)
    .lean();

  return docs.map((d) => docToCustomer(d as Record<string, unknown>));
}
