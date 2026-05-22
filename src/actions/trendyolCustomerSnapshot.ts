"use server";

// Trendyol müşteri bilgisi snapshot servisleri.
//
// - syncRecentCustomers(daysBack): Trendyol /packages'tan son N gün paketlerini
//   çeker, customer+address+phone bilgilerini MongoDB'ye upsert eder. TTL index
//   sayesinde 60 gün sonra otomatik silinir.
// - getCustomersByOrderNumbers(): yorum listesi için batch lookup.
// - forgetCustomer(): KVKK silme talebi için tek kayıt siler.

import { connectDB } from "@/lib/mongodb";
import TrendyolCustomerSnapshot from "@/models/TrendyolCustomerSnapshot";
import {
  listTrendyolPackages,
  type TrendyolPackage,
} from "@/lib/integrations/trendyol/client";

const DAY_MS = 24 * 60 * 60 * 1000;

// Module-level rate gate: aynı process içinde 1 saat'te bir sync yeter.
// Vercel cold-start'ta sıfırlanır → günde birkaç sync olur, sorun değil.
let lastSyncAt = 0;
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 saat

export interface TrendyolCustomerLine {
  productId?: number;
  name: string;
  quantity: number;
  unitSellingPrice: number;
}

export interface TrendyolCustomerSummary {
  orderNumber: string;
  customerName: string;
  phone: string;
  addressFull: string;
  district: string;
  city: string;
  neighborhood: string;
  addressDescription: string;
  packageCreationDate: number | null;
  packageModificationDate: number | null;
  preparationTime: number;        // dakika
  totalPrice: number;
  packageStatus: string;
  deliveryType: string;
  lines: TrendyolCustomerLine[];
}

function packageToSnapshot(p: TrendyolPackage) {
  const name = [p.customer?.firstName, p.customer?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const addrParts = [
    p.address?.neighborhood,
    p.address?.district,
    p.address?.city,
  ]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join(", ");
  const fullAddress = [addrParts, p.address?.addressDescription]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join(" — ");

  return {
    orderNumber: p.orderNumber,
    customerId: p.customer?.id,
    customerName: name,
    phone: p.address?.phone ?? p.callCenterPhone ?? "",
    addressFull: fullAddress,
    city: p.address?.city ?? "",
    district: p.address?.district ?? "",
    neighborhood: p.address?.neighborhood ?? "",
    addressDescription: p.address?.addressDescription ?? "",
    totalPrice: p.totalPrice ?? 0,
    packageStatus: p.packageStatus ?? "",
    packageCreationDate: p.packageCreationDate
      ? new Date(p.packageCreationDate)
      : undefined,
    packageModificationDate: p.packageModificationDate
      ? new Date(p.packageModificationDate)
      : undefined,
    preparationTime: p.preparationTime ?? 0,
    lines: (p.lines ?? []).map((l) => ({
      productId: l.productId,
      name: l.name,
      quantity: l.items?.length ?? 1,
      unitSellingPrice: l.unitSellingPrice ?? l.price ?? 0,
    })),
    storeId: p.storeId,
    deliveryType: p.deliveryType,
    lastSeenAt: new Date(),
  };
}

async function fetchPackagesRange(
  start: number,
  end: number,
): Promise<TrendyolPackage[]> {
  const size = 50;
  const first = await listTrendyolPackages({
    modificationStartDate: start,
    modificationEndDate: end,
    page: 0,
    size,
  });
  if (!first.ok) throw new Error(`Trendyol API: ${first.status} ${first.error}`);

  const totalPages = Math.min(first.data.totalPages ?? 1, 200);
  const all: TrendyolPackage[] = [...(first.data.content ?? [])];
  if (totalPages <= 1) return all;

  const BATCH = 5;
  for (let pageStart = 1; pageStart < totalPages; pageStart += BATCH) {
    const pages = Array.from(
      { length: Math.min(BATCH, totalPages - pageStart) },
      (_, i) => pageStart + i,
    );
    const results = await Promise.all(
      pages.map((page) =>
        listTrendyolPackages({
          modificationStartDate: start,
          modificationEndDate: end,
          page,
          size,
        }),
      ),
    );
    for (const r of results) {
      if (!r.ok) throw new Error(`Trendyol API: ${r.status} ${r.error}`);
      all.push(...(r.data.content ?? []));
    }
  }
  return all;
}

export interface SyncResult {
  ok: boolean;
  upserted: number;
  daysBack: number;
  skipped?: boolean;
  error?: string;
}

// Son N gün paketlerini MongoDB'ye upsert eder. Force=true ile rate gate
// aşılarak zorla çalıştırılabilir (manuel "Senkronla" butonu için).
export async function syncRecentCustomers(
  daysBack = 30,
  force = false,
): Promise<SyncResult> {
  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_INTERVAL_MS) {
    return { ok: true, upserted: 0, daysBack, skipped: true };
  }

  try {
    await connectDB();
    const start = now - daysBack * DAY_MS;
    const packages = await fetchPackagesRange(start, now);

    if (packages.length === 0) {
      lastSyncAt = now;
      return { ok: true, upserted: 0, daysBack };
    }

    const ops = packages.map((p) => ({
      updateOne: {
        filter: { orderNumber: p.orderNumber },
        update: { $set: packageToSnapshot(p) },
        upsert: true,
      },
    }));

    // Mongoose'un bulkWrite tipleri DocumentArray bekliyor, biz POJO veriyoruz;
    // runtime'da doğru çalışıyor — cast ile tipi gevşetiyoruz.
    const res = await TrendyolCustomerSnapshot.bulkWrite(
      ops as Parameters<typeof TrendyolCustomerSnapshot.bulkWrite>[0],
      { ordered: false },
    );
    lastSyncAt = now;
    return {
      ok: true,
      upserted: (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0),
      daysBack,
    };
  } catch (err) {
    return {
      ok: false,
      upserted: 0,
      daysBack,
      error: err instanceof Error ? err.message : "Sync hatası",
    };
  }
}

export async function getCustomersByOrderNumbers(
  orderNumbers: string[],
): Promise<Map<string, TrendyolCustomerSummary>> {
  const out = new Map<string, TrendyolCustomerSummary>();
  if (orderNumbers.length === 0) return out;

  try {
    await connectDB();
    const docs = await TrendyolCustomerSnapshot.find({
      orderNumber: { $in: orderNumbers },
    }).lean();

    for (const d of docs) {
      out.set(d.orderNumber, {
        orderNumber: d.orderNumber,
        customerName: d.customerName ?? "",
        phone: d.phone ?? "",
        addressFull: d.addressFull ?? "",
        city: d.city ?? "",
        district: d.district ?? "",
        neighborhood: d.neighborhood ?? "",
        addressDescription: d.addressDescription ?? "",
        packageCreationDate: d.packageCreationDate
          ? new Date(d.packageCreationDate).getTime()
          : null,
        packageModificationDate: d.packageModificationDate
          ? new Date(d.packageModificationDate).getTime()
          : null,
        preparationTime: d.preparationTime ?? 0,
        totalPrice: d.totalPrice ?? 0,
        packageStatus: d.packageStatus ?? "",
        deliveryType: d.deliveryType ?? "",
        lines: (d.lines ?? []).map((l) => ({
          productId: l.productId ?? undefined,
          name: l.name ?? "",
          quantity: l.quantity ?? 1,
          unitSellingPrice: l.unitSellingPrice ?? 0,
        })),
      });
    }
  } catch {
    // DB unavailable → enrichment yok, sayfa yine çalışmalı
  }
  return out;
}

export interface ForgetResult {
  ok: boolean;
  deleted: number;
  error?: string;
}

// KVKK silme talebi için. Belirli bir orderNumber'ın snapshot'ını anında siler.
export async function forgetCustomer(orderNumber: string): Promise<ForgetResult> {
  if (!orderNumber) return { ok: false, deleted: 0, error: "orderNumber boş" };
  try {
    await connectDB();
    const res = await TrendyolCustomerSnapshot.deleteOne({ orderNumber });
    return { ok: true, deleted: res.deletedCount ?? 0 };
  } catch (err) {
    return {
      ok: false,
      deleted: 0,
      error: err instanceof Error ? err.message : "Silme hatası",
    };
  }
}
