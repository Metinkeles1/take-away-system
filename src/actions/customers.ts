"use server";

import { connectDB } from "@/lib/mongodb";
import CustomerModel from "@/models/Customer";
import OrderModel from "@/models/Order";
import { toLocalPhone } from "@/lib/utils";
import {
  type CustomerOrderSummary,
  type OrderItem,
  type SavedCustomer,
} from "@/types";

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

  // Telefonu tek standarda çek (0 + 10 hane) — kayıt ve eşleşme tutarlı olsun.
  const phone = toLocalPhone(customer.phone);
  await CustomerModel.findOneAndUpdate(
    { phone },
    {
      $set: {
        id: customer.id,
        name: customer.name,
        phone,
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

// ─── Müşterinin geçmiş siparişleri (telefon üzerinden) ───────────────────────
// Müşteriler sayfasında "ne sipariş etmiş" dökümü için. En yeni önce, tavanlı.
export async function getCustomerOrderHistory(
  phone: string,
): Promise<CustomerOrderSummary[]> {
  await connectDB();

  const docs = await OrderModel.find({ "customer.phone": phone })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return docs.map((doc) => {
    const d = doc as Record<string, unknown>;
    const items = (d.items as OrderItem[] | undefined) ?? [];
    return {
      id: d.id as string,
      orderNumber: d.orderNumber as number,
      createdAt: (d as { createdAt: Date }).createdAt,
      total: d.total as number,
      status: d.status as CustomerOrderSummary["status"],
      paymentStatus:
        (d.paymentStatus as CustomerOrderSummary["paymentStatus"]) ?? "paid",
      source: (d.source as CustomerOrderSummary["source"]) ?? "manual",
      notes: (d.notes as string | undefined) ?? undefined,
      items: items.map((it) => ({
        name: it.product?.name ?? "Ürün",
        quantity: it.quantity,
        portionLabel: it.portion?.label,
        totalPrice: it.totalPrice,
      })),
    };
  });
}

// ─── Müşteri sil ─────────────────────────────────────────────────────────────
export async function deleteCustomer(id: string): Promise<void> {
  await connectDB();
  await CustomerModel.deleteOne({ id });
}

// ─── Müşteri güncelle ────────────────────────────────────────────────────────
export async function updateCustomer(
  id: string,
  data: { name: string; phone: string; address: string; addressDetail?: string },
): Promise<void> {
  await connectDB();
  await CustomerModel.findOneAndUpdate(
    { id },
    { $set: { ...data, phone: toLocalPhone(data.phone) } },
  );
}

// ─── Yeni müşteri ekle ──────────────────────────────────────────────────────
export async function createCustomer(
  customer: { id: string; name: string; phone: string; address: string; addressDetail?: string },
): Promise<void> {
  await connectDB();
  await CustomerModel.create({
    id: customer.id,
    name: customer.name,
    phone: toLocalPhone(customer.phone),
    address: customer.address,
    addressDetail: customer.addressDetail,
    orderCount: 0,
  });
}
