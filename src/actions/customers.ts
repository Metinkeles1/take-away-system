"use server";

import { after } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CustomerModel from "@/models/Customer";
import OrderModel from "@/models/Order";
import { phoneKey, toLocalPhone } from "@/lib/utils";
import { normalizeOrderItems } from "@/lib/orders/items";
import {
  addressKey,
  findMatchingAddress,
  newAddressId,
  normalizeCustomerAddresses,
  pickDefaultAddress,
} from "@/lib/customers/addresses";
import { addressesSetFields } from "@/lib/customers/recordAddress";
import { phoneMatchRegex } from "@/lib/customers/geoByPhone";
import { customerSearchRegex } from "@/lib/customers/searchPattern";
import {
  type ContactSyncResult,
  syncNewCustomersToGoogleContacts,
} from "@/lib/customers/googleContactsSync";
import {
  type CustomerAddress,
  type CustomerCheckPerson,
  type CustomerDataCheck,
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

// ─── Rehber (Google Contacts) aktarımı ───────────────────────────────────────
// "new": yalnız rehbere hiç aktarılmamış müşteriler — telefona aynı kişiyi
// tekrar yükleyip çift kayıt / birleşmiş bozuk kayıt üretmemek için.
// "all": hepsi (rehberi sıfırdan kurarken). Arama kutusundan bağımsız: her
// zaman veritabanındaki tam listeden okunur.
export async function getCustomersForContactExport(
  mode: "new" | "all",
): Promise<SavedCustomer[]> {
  await connectDB();
  const filter = mode === "new" ? { contactExportedAt: { $exists: false } } : {};
  const docs = await CustomerModel.find(filter).sort({ createdAt: 1 }).lean();
  return docs.map((d) => docToCustomer(d as Record<string, unknown>));
}

// İndirilen müşterileri "rehbere aktarıldı" olarak işaretle — bir sonraki
// "Yeni kişileri indir" bunları tekrar vermez.
export async function markCustomersContactExported(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await connectDB();
  // timestamps: false → updatedAt değişmesin (liste "son sipariş"e göre sıralı).
  await CustomerModel.updateMany(
    { id: { $in: ids } },
    { $set: { contactExportedAt: new Date() } },
    { timestamps: false },
  );
}

// Rehbere aktarılmamış müşterileri CSV yerine doğrudan Google Kişiler'e yazar.
// Normalde yeni müşteri oluşunca kendiliğinden çalışır; buton kaçanlar için.
// "all": rehberde eksik kalan tüm müşterileri tamamlar (bkz. googleContactsSync).
export async function syncCustomersToGoogleContacts(
  mode: "new" | "all" = "new",
): Promise<ContactSyncResult> {
  return syncNewCustomersToGoogleContacts(mode, mode === "all" ? "manual-all" : "manual-new");
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
  const regex = customerSearchRegex(query);

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

// ─── Kayıt kontrolü: çift numara / çok adresli / ortak adres ─────────────────
export async function getCustomerDataCheck(): Promise<CustomerDataCheck> {
  await connectDB();
  const docs = (await CustomerModel.find(
    {},
    { id: 1, name: 1, phone: 1, orderCount: 1, address: 1, addressDetail: 1, geo: 1, addresses: 1, updatedAt: 1 },
  ).lean()) as Record<string, unknown>[];

  const byPhone = new Map<string, CustomerDataCheck["duplicatePhones"][number]["records"]>();
  const byAddress = new Map<string, CustomerDataCheck["sharedAddresses"][number]>();
  const multiAddress: CustomerDataCheck["multiAddress"] = [];

  for (const doc of docs) {
    const person: CustomerCheckPerson = {
      id: doc.id as string,
      name: (doc.name as string) || "",
      phone: doc.phone as string,
      orderCount: (doc.orderCount as number) ?? 0,
    };
    const { addresses } = normalizeCustomerAddresses(
      doc as Parameters<typeof normalizeCustomerAddresses>[0],
    );

    const k = phoneKey(person.phone);
    if (k.length >= 7) {
      const list = byPhone.get(k) ?? [];
      list.push({ ...person, addressCount: addresses.length });
      byPhone.set(k, list);
    }

    if (addresses.length > 1) {
      multiAddress.push({
        ...person,
        addresses: addresses
          .map((a) => ({
            address: a.address,
            addressDetail: a.addressDetail,
            useCount: a.useCount,
            hasPin: !!a.geo,
          }))
          .sort((a, b) => b.useCount - a.useCount),
      });
    }

    for (const a of addresses) {
      const ak = addressKey(a.address, a.addressDetail);
      const entry = byAddress.get(ak) ?? {
        address: a.address,
        addressDetail: a.addressDetail,
        customers: [],
      };
      // Aynı numaranın çift kaydı ortak adres sayılmasın (o ayrı listede).
      if (!entry.customers.some((c) => phoneKey(c.phone) === k))
        entry.customers.push(person);
      byAddress.set(ak, entry);
    }
  }

  return {
    duplicatePhones: [...byPhone.values()]
      .filter((r) => r.length > 1)
      .map((records) => ({ phone: toLocalPhone(records[0].phone), records }))
      .sort((a, b) => b.records.length - a.records.length),
    multiAddress: multiAddress.sort(
      (a, b) => b.addresses.length - a.addresses.length || b.orderCount - a.orderCount,
    ),
    sharedAddresses: [...byAddress.values()]
      .filter((e) => e.customers.length > 1)
      .sort((a, b) => b.customers.length - a.customers.length),
  };
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
    const items = normalizeOrderItems((d.items as OrderItem[] | undefined) ?? []);
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

// Bu numara başka bir müşteride kayıtlı mı (son 10 hane eşleşmesi). Aynı
// numaraya ikinci kayıt açılırsa adresler/pinler ikiye bölünür ve sipariş
// ekranı hangisini getireceğini bilemez.
async function phoneTakenBy(
  phone: string,
  excludeId?: string,
): Promise<string | null> {
  const rx = phoneMatchRegex(phone);
  if (!rx) return null;
  // Regex rakam dizisini numaranın içinde de bulur (kısa numara uzununun
  // parçası olabilir) — son 10 hane birebir aynı olanı say.
  const key = phoneKey(phone);
  const docs = (await CustomerModel.find({
    phone: rx,
    ...(excludeId ? { id: { $ne: excludeId } } : {}),
  })
    .select("name phone")
    .lean()) as { name?: string; phone?: string }[];
  const hit = docs.find((d) => phoneKey(d.phone ?? "") === key);
  return hit ? (hit.name ?? "") : null;
}

// customers.phone unique index'i: kontrol ile yazım arasında başka biri aynı
// numarayı kaydettiyse veritabanı reddeder (E11000).
const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

function phoneTakenError(name: string): string {
  return `Bu numara zaten kayıtlı${name ? ` (${name})` : ""} — o müşteriye adres ekleyin`;
}

// ─── Müşteri güncelle (isim / telefon) ───────────────────────────────────────
// address/addressDetail verilirse VARSAYILAN adres düzenlenir (eski form uyumu).
// Mevcut siparişler değişmez — yeni adres sonraki siparişlerde kullanılır.
export async function updateCustomer(
  id: string,
  data: { name: string; phone: string; address?: string; addressDetail?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await connectDB();
  const doc = await CustomerModel.findOne({ id }).lean();
  if (!doc) return { ok: false, error: "Müşteri bulunamadı" };
  // Numara değişmediyse kontrol yok — isim düzeltmesi engellenmesin.
  if (phoneKey(data.phone) !== phoneKey((doc as { phone?: string }).phone ?? "")) {
    const taken = await phoneTakenBy(data.phone, id);
    if (taken !== null) return { ok: false, error: phoneTakenError(taken) };
  }
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
  try {
    await CustomerModel.updateOne({ id }, { $set });
  } catch (e) {
    if (isDuplicateKey(e)) return { ok: false, error: phoneTakenError("") };
    throw e;
  }
  return { ok: true };
}

// ─── Yeni müşteri ekle ──────────────────────────────────────────────────────
export async function createCustomer(customer: {
  id: string;
  name: string;
  phone: string;
  address: string;
  addressDetail?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await connectDB();
  const taken = await phoneTakenBy(customer.phone);
  if (taken !== null) return { ok: false, error: phoneTakenError(taken) };
  try {
    await CustomerModel.create({
      id: customer.id,
      name: customer.name,
      phone: toLocalPhone(customer.phone),
      orderCount: 0,
      ...addressesSetFields([newAddress(customer.address, customer.addressDetail)]),
    });
  } catch (e) {
    if (isDuplicateKey(e)) return { ok: false, error: phoneTakenError("") };
    throw e;
  }
  after(() => syncNewCustomersToGoogleContacts());
  return { ok: true };
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
