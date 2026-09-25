"use server";

import { connectDB } from "@/lib/mongodb";
import CustomerModel from "@/models/Customer";
import OrderModel from "@/models/Order";
import { toLocalPhone } from "@/lib/utils";
import {
  findMatchingAddress,
  newAddressId,
  normalizeCustomerAddresses,
  pickDefaultAddress,
} from "@/lib/customers/addresses";
import { addressesSetFields } from "@/lib/customers/recordAddress";
import {
  type CustomerAddress,
  type CustomerOrderSummary,
  type OrderItem,
  type SavedCustomer,
} from "@/types";

function docToCustomer(doc: Record<string, unknown>): SavedCustomer {
  const { addresses, defaultAddressId } = normalizeCustomerAddresses(
    doc as Parameters<typeof normalizeCustomerAddresses>[0],
  );
  const def = pickDefaultAddress(addresses, defaultAddressId);
  return {
    id: doc.id as string,
    name: doc.name as string,
    phone: doc.phone as string,
    // Üst seviye adres = varsayılan adres (eski ekranlar bunu okur).
    address: def?.address ?? (doc.address as string),
    addressDetail: def ? def.addressDetail : (doc.addressDetail as string | undefined),
    addresses,
    defaultAddressId,
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

// ─── Tek müşteri getir (adres işlemleri sonrası tazeleme) ─────────────────────
export async function getSavedCustomer(id: string): Promise<SavedCustomer | null> {
  await connectDB();
  const doc = await CustomerModel.findOne({ id }).lean();
  return doc ? docToCustomer(doc as Record<string, unknown>) : null;
}

// ─── İsim, telefon veya adrese göre ara ──────────────────────────────────────────────
export async function searchCustomers(query: string): Promise<SavedCustomer[]> {
  await connectDB();
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");

  const docs = await CustomerModel.find({
    $or: [
      { address: regex },
      { "addresses.address": regex },
      { name: regex },
      { phone: regex },
    ],
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

// ─── Müşteri güncelle (isim / telefon) ───────────────────────────────────────
// address/addressDetail verilirse VARSAYILAN adres düzenlenir (eski form uyumu).
// Mevcut siparişler değişmez — yeni adres sonraki siparişlerde kullanılır.
export async function updateCustomer(
  id: string,
  data: { name: string; phone: string; address?: string; addressDetail?: string },
): Promise<void> {
  await connectDB();
  const doc = await CustomerModel.findOne({ id }).lean();
  if (!doc) return;
  const $set: Record<string, unknown> = {
    name: data.name,
    phone: toLocalPhone(data.phone),
  };
  if (data.address !== undefined) {
    const { addresses, defaultAddressId } = normalizeCustomerAddresses(
      doc as Parameters<typeof normalizeCustomerAddresses>[0],
    );
    const def = pickDefaultAddress(addresses, defaultAddressId);
    const next = def
      ? addresses.map((a) =>
          a.id === def.id
            ? {
                ...a,
                address: data.address as string,
                addressDetail: data.addressDetail || undefined,
              }
            : a,
        )
      : [newAddress(data.address, data.addressDetail)];
    Object.assign($set, addressesSetFields(next, defaultAddressId));
  }
  await CustomerModel.updateOne({ id }, { $set });
}

// ─── Yeni müşteri ekle ──────────────────────────────────────────────────────
export async function createCustomer(customer: {
  id: string;
  name: string;
  phone: string;
  address: string;
  addressDetail?: string;
}): Promise<void> {
  await connectDB();
  await CustomerModel.create({
    id: customer.id,
    name: customer.name,
    phone: toLocalPhone(customer.phone),
    orderCount: 0,
    ...addressesSetFields([newAddress(customer.address, customer.addressDetail)]),
  });
}

function newAddress(address: string, addressDetail?: string): CustomerAddress {
  return {
    id: newAddressId(),
    address,
    addressDetail: addressDetail || undefined,
    useCount: 0,
    lastUsedAt: new Date(),
  };
}

// ─── Adres listesi işlemleri (müşteriler sekmesi) ───────────────────────────
// Hepsi aynı kalıp: listeyi oku → değiştir → liste + varsayılan kopyasını yaz.
async function mutateAddresses(
  customerId: string,
  fn: (
    addresses: CustomerAddress[],
    defaultAddressId: string | undefined,
  ) => { addresses: CustomerAddress[]; defaultAddressId?: string } | { error: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await connectDB();
  const doc = await CustomerModel.findOne({ id: customerId }).lean();
  if (!doc) return { ok: false, error: "Müşteri bulunamadı" };
  const cur = normalizeCustomerAddresses(
    doc as Parameters<typeof normalizeCustomerAddresses>[0],
  );
  const res = fn(cur.addresses, cur.defaultAddressId);
  if ("error" in res) return { ok: false, error: res.error };
  await CustomerModel.updateOne(
    { id: customerId },
    { $set: addressesSetFields(res.addresses, res.defaultAddressId) },
  );
  return { ok: true };
}

export async function addCustomerAddress(
  customerId: string,
  data: { address: string; addressDetail?: string },
) {
  if (!data.address.trim()) return { ok: false as const, error: "Adres boş olamaz" };
  return mutateAddresses(customerId, (list, def) => {
    if (findMatchingAddress(list, data.address, data.addressDetail))
      return { error: "Bu adres zaten kayıtlı" };
    return {
      addresses: [...list, newAddress(data.address, data.addressDetail)],
      defaultAddressId: def,
    };
  });
}

// Metin düzenlenince pin korunur (düzenlemeler çoğunlukla yazım düzeltmesi);
// pin yanlışsa kurye bir sonraki teslimatta yeniden pinler.
export async function updateCustomerAddress(
  customerId: string,
  addressId: string,
  data: { address: string; addressDetail?: string },
) {
  if (!data.address.trim()) return { ok: false as const, error: "Adres boş olamaz" };
  return mutateAddresses(customerId, (list, def) => {
    if (!list.some((a) => a.id === addressId)) return { error: "Adres bulunamadı" };
    const dup = findMatchingAddress(list, data.address, data.addressDetail);
    if (dup && dup.id !== addressId) return { error: "Bu adres zaten kayıtlı" };
    return {
      addresses: list.map((a) =>
        a.id === addressId
          ? { ...a, address: data.address, addressDetail: data.addressDetail || undefined }
          : a,
      ),
      defaultAddressId: def,
    };
  });
}

export async function deleteCustomerAddress(customerId: string, addressId: string) {
  return mutateAddresses(customerId, (list, def) => {
    if (list.length <= 1) return { error: "Müşterinin en az bir adresi olmalı" };
    return {
      addresses: list.filter((a) => a.id !== addressId),
      defaultAddressId: def === addressId ? undefined : def,
    };
  });
}

export async function setDefaultCustomerAddress(customerId: string, addressId: string) {
  return mutateAddresses(customerId, (list) => {
    if (!list.some((a) => a.id === addressId)) return { error: "Adres bulunamadı" };
    return { addresses: list, defaultAddressId: addressId };
  });
}
