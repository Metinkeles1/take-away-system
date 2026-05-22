"use server";

// Müşteri merkezli listeleme — TrendyolCustomerSnapshot DB'sinden okur.
// /dashboard/trendyol/customers "Tüm Müşteriler" tab'i tarafından kullanılır.
//
// Snapshot bazlı, Trendyol API'sine bu listede çağrı yapılmaz; o yüzden TTL
// (60 gün) içindeki tüm müşterileri kapsar. Yorum bilgisi liste düzeyinde
// gösterilmez (her müşteri için ayrı API çağrısı çok pahalı) — detayda var.

import type { PipelineStage } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import TrendyolCustomerSnapshot from "@/models/TrendyolCustomerSnapshot";
import {
  listTrendyolReviews,
  type TrendyolReview,
} from "@/lib/integrations/trendyol/client";
import { syncRecentCustomers } from "@/actions/trendyolCustomerSnapshot";

export type CustomerSortBy =
  | "lastOrder"     // en son sipariş veren önce
  | "orderCount"    // en çok sipariş veren önce
  | "totalRevenue"  // en çok harcayan önce
  | "name";         // alfabetik

const NON_REVENUE_STATUSES = ["Cancelled", "UnSupplied"];

export interface AllCustomerRow {
  // customerId yoksa phone, ikisi de yoksa orderNumber ile fallback
  groupKey: string;
  customerId: number | null;
  name: string;
  phone: string;
  city: string;
  district: string;
  neighborhood: string;
  addressFull: string;
  orderCount: number;          // delivered + non-cancelled
  cancelledCount: number;
  totalRevenue: number;        // cancelled hariç
  lastOrderAt: number;         // ms
  firstOrderAt: number;        // ms
  orderNumbers: string[];      // detay/yorum lookup için
}

export interface GetAllCustomersResult {
  customers: AllCustomerRow[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
  error?: string;
}

export interface GetAllCustomersParams {
  search?: string;        // isim/telefon/adres regex
  sortBy?: CustomerSortBy;
  page?: number;
  size?: number;
}

export async function getAllCustomers(
  params: GetAllCustomersParams = {},
): Promise<GetAllCustomersResult> {
  const { search = "", sortBy = "lastOrder", page = 0, size = 25 } = params;

  try {
    // Snapshot'ın güncel olduğundan emin ol (rate-gated, sessiz hata).
    try {
      await syncRecentCustomers(30, false);
    } catch {
      /* sync hatası listeyi engellemesin */
    }

    await connectDB();

    // Aggregation pipeline:
    // 1) Snapshot'tan tüm kayıtları al
    // 2) groupKey hesapla (customerId varsa onu, yoksa phone, yoksa orderNumber)
    // 3) Müşteri bazında grupla → adet, toplam, son sipariş, vb.
    // 4) Arama filtresi (isim/telefon/adres regex)
    // 5) Sırala + paginate

    const searchTrim = search.trim();
    const searchRegex = searchTrim
      ? new RegExp(escapeRegex(searchTrim), "i")
      : null;

    const sortStage = sortStageFor(sortBy);

    // İlk olarak groupKey kuruyoruz. customerId varsa "c:<id>", yoksa
    // "p:<phone>", o da yoksa "o:<orderNumber>" (tek satır).
    const pipeline: PipelineStage[] = [
      {
        $addFields: {
          groupKey: {
            $cond: [
              { $and: [{ $ne: ["$customerId", null] }, { $gt: ["$customerId", 0] }] },
              { $concat: ["c:", { $toString: "$customerId" }] },
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$phone", null] },
                      { $ne: ["$phone", ""] },
                    ],
                  },
                  { $concat: ["p:", "$phone"] },
                  { $concat: ["o:", "$orderNumber"] },
                ],
              },
            ],
          },
        },
      },
      // Aynı müşterinin en son siparişini "first" olarak alabilmek için sırala.
      { $sort: { packageCreationDate: -1 } },
      {
        $group: {
          _id: "$groupKey",
          customerId: { $first: "$customerId" },
          name: { $first: "$customerName" },
          phone: { $first: "$phone" },
          city: { $first: "$city" },
          district: { $first: "$district" },
          neighborhood: { $first: "$neighborhood" },
          addressFull: { $first: "$addressFull" },
          lastOrderAt: { $first: "$packageCreationDate" },
          firstOrderAt: { $last: "$packageCreationDate" },
          orderCount: {
            $sum: {
              $cond: [
                { $in: ["$packageStatus", NON_REVENUE_STATUSES] },
                0,
                1,
              ],
            },
          },
          cancelledCount: {
            $sum: {
              $cond: [
                { $in: ["$packageStatus", NON_REVENUE_STATUSES] },
                1,
                0,
              ],
            },
          },
          totalRevenue: {
            $sum: {
              $cond: [
                { $in: ["$packageStatus", NON_REVENUE_STATUSES] },
                0,
                { $ifNull: ["$totalPrice", 0] },
              ],
            },
          },
          orderNumbers: { $push: "$orderNumber" },
        },
      },
    ];

    if (searchRegex) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: searchRegex } },
            { phone: { $regex: searchRegex } },
            { addressFull: { $regex: searchRegex } },
            { district: { $regex: searchRegex } },
            { neighborhood: { $regex: searchRegex } },
          ],
        },
      });
    }

    // Toplam sayım için ayrı bir facet
    pipeline.push({
      $facet: {
        rows: [
          { $sort: sortStage },
          { $skip: page * size },
          { $limit: size },
        ],
        meta: [{ $count: "total" }],
      },
    });

    const [out] = await TrendyolCustomerSnapshot.aggregate(pipeline);
    const rows: Array<{
      _id: string;
      customerId?: number | null;
      name?: string;
      phone?: string;
      city?: string;
      district?: string;
      neighborhood?: string;
      addressFull?: string;
      lastOrderAt?: Date;
      firstOrderAt?: Date;
      orderCount?: number;
      cancelledCount?: number;
      totalRevenue?: number;
      orderNumbers?: string[];
    }> = out?.rows ?? [];
    const totalCount: number = out?.meta?.[0]?.total ?? 0;

    const customers: AllCustomerRow[] = rows.map((r) => ({
      groupKey: r._id,
      customerId: r.customerId ?? null,
      name: r.name ?? "—",
      phone: r.phone ?? "",
      city: r.city ?? "",
      district: r.district ?? "",
      neighborhood: r.neighborhood ?? "",
      addressFull: r.addressFull ?? "",
      orderCount: r.orderCount ?? 0,
      cancelledCount: r.cancelledCount ?? 0,
      totalRevenue: r.totalRevenue ?? 0,
      lastOrderAt: r.lastOrderAt ? new Date(r.lastOrderAt).getTime() : 0,
      firstOrderAt: r.firstOrderAt ? new Date(r.firstOrderAt).getTime() : 0,
      orderNumbers: r.orderNumbers ?? [],
    }));

    return {
      customers,
      page,
      size,
      totalCount,
      totalPages: Math.ceil(totalCount / size),
    };
  } catch (err) {
    return {
      customers: [],
      page,
      size,
      totalCount: 0,
      totalPages: 0,
      error: err instanceof Error ? err.message : "Müşteri listesi alınamadı",
    };
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortStageFor(sortBy: CustomerSortBy): Record<string, 1 | -1> {
  switch (sortBy) {
    case "orderCount":
      return { orderCount: -1, lastOrderAt: -1 };
    case "totalRevenue":
      return { totalRevenue: -1, lastOrderAt: -1 };
    case "name":
      return { name: 1 };
    case "lastOrder":
    default:
      return { lastOrderAt: -1 };
  }
}

// ─── Customer Detail ───────────────────────────────────────────────
// Belirli bir müşterinin tüm siparişleri (snapshot'tan) + yorumları
// (Reviews API'sinden orderParentId üzerinden filtre).

export interface CustomerOrderRow {
  orderNumber: string;
  packageCreationDate: number;
  totalPrice: number;
  packageStatus: string;
  deliveryType: string;
}

export interface CustomerDetailResult {
  groupKey: string;
  customerId: number | null;
  name: string;
  phone: string;
  addressFull: string;
  city: string;
  district: string;
  neighborhood: string;
  orderCount: number;
  totalRevenue: number;
  orders: CustomerOrderRow[];
  reviews: TrendyolReview[];
  error?: string;
}

// groupKey "c:<id>" | "p:<phone>" | "o:<orderNumber>" formatında.
export async function getCustomerDetail(
  groupKey: string,
): Promise<CustomerDetailResult | null> {
  try {
    await connectDB();

    let filter: Record<string, unknown> | null = null;
    if (groupKey.startsWith("c:")) {
      const id = parseInt(groupKey.slice(2), 10);
      if (Number.isFinite(id)) filter = { customerId: id };
    } else if (groupKey.startsWith("p:")) {
      filter = { phone: groupKey.slice(2) };
    } else if (groupKey.startsWith("o:")) {
      filter = { orderNumber: groupKey.slice(2) };
    }
    if (!filter) return null;

    const docs = await TrendyolCustomerSnapshot.find(filter)
      .sort({ packageCreationDate: -1 })
      .lean();
    if (docs.length === 0) return null;

    const head = docs[0];
    const orders: CustomerOrderRow[] = docs.map((d) => ({
      orderNumber: d.orderNumber,
      packageCreationDate: d.packageCreationDate
        ? new Date(d.packageCreationDate).getTime()
        : 0,
      totalPrice: d.totalPrice ?? 0,
      packageStatus: d.packageStatus ?? "",
      deliveryType: d.deliveryType ?? "",
    }));

    const orderCount = orders.filter(
      (o) => !NON_REVENUE_STATUSES.includes(o.packageStatus),
    ).length;
    const totalRevenue = orders
      .filter((o) => !NON_REVENUE_STATUSES.includes(o.packageStatus))
      .reduce((s, o) => s + o.totalPrice, 0);

    // Yorumları çek — bu müşterinin tüm orderNumber'ları için Reviews API'sini
    // orderParentId filtresiyle çağır. Her sorgu tek bir sipariş için olduğundan
    // küçük ve hızlı.
    const reviews = await fetchReviewsForOrders(
      orders.map((o) => o.orderNumber),
      head.storeId ?? undefined,
    );

    return {
      groupKey,
      customerId: head.customerId ?? null,
      name: head.customerName ?? "—",
      phone: head.phone ?? "",
      addressFull: head.addressFull ?? "",
      city: head.city ?? "",
      district: head.district ?? "",
      neighborhood: head.neighborhood ?? "",
      orderCount,
      totalRevenue,
      orders,
      reviews,
    };
  } catch (err) {
    return {
      groupKey,
      customerId: null,
      name: "—",
      phone: "",
      addressFull: "",
      city: "",
      district: "",
      neighborhood: "",
      orderCount: 0,
      totalRevenue: 0,
      orders: [],
      reviews: [],
      error: err instanceof Error ? err.message : "Detay alınamadı",
    };
  }
}

// Reviews API'sinden orderParentId bazlı filtreyle yorumları çek.
// storeId belirsizse env'den ya da snapshot'tan çıkar; bulunamazsa atla.
async function fetchReviewsForOrders(
  orderNumbers: string[],
  storeId?: number,
): Promise<TrendyolReview[]> {
  if (orderNumbers.length === 0) return [];

  // storeId resolve
  let resolvedStore = storeId;
  if (!resolvedStore) {
    const envStore = process.env.TRENDYOL_STORE_ID;
    if (envStore) {
      const first = envStore.split(",")[0]?.trim();
      const n = first ? parseInt(first, 10) : NaN;
      if (Number.isFinite(n)) resolvedStore = n;
    }
  }
  if (!resolvedStore) return [];

  // Her orderNumber için tek tek çağır — orderParentId number, bizim string;
  // bozuk kayıtları atla.
  const results = await Promise.all(
    orderNumbers.map(async (orderNumberStr) => {
      const orderParentId = parseInt(orderNumberStr, 10);
      if (!Number.isFinite(orderParentId)) return [];
      const res = await listTrendyolReviews({
        storeId: resolvedStore!,
        orderParentId,
        size: 50,
      });
      if (!res.ok) return [];
      return res.data.content ?? [];
    }),
  );
  return results.flat();
}
