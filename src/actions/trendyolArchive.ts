"use server";

// Trendyol sipariş arşivi (TrendyolOrder) — sayfaların çağırdığı işlemler.
// Besleme/bakım mantığı src/lib/trendyol/archive.ts'te.

import { connectDB } from "@/lib/mongodb";
import TrendyolOrderModel from "@/models/TrendyolOrder";
import {
  formatArchivedAddress,
  anonymizeTrendyolOrders,
  backfillTrendyolRange,
  ensureTrendyolArchiveFresh,
  getTrendyolArchiveMeta,
  trendyolConfigured,
} from "@/lib/trendyol/archive";
import {
  NON_REVENUE_STATUSES,
  PAYMENT_LABEL,
  archivedNet,
} from "@/lib/integrations/trendyol/packageUtils";
import { istanbulDayStart } from "@/lib/datetime";
import type { Order } from "@/types";
import { periodWindows, DAY_MS, type DashboardPeriod } from "@/lib/dashboardPeriods";

const NON_REVENUE = [...NON_REVENUE_STATUSES];

// ─── Durum + elle senkron ────────────────────────────────────────────────────
export interface TrendyolArchiveStatus {
  configured: boolean;
  orderCount: number;
  oldestOrderAt: number | null;
  lastSyncAt: number | null;
  lastSettlementAt: number | null;
}

export async function getTrendyolArchiveStatus(): Promise<TrendyolArchiveStatus> {
  if (!trendyolConfigured()) {
    return { configured: false, orderCount: 0, oldestOrderAt: null, lastSyncAt: null, lastSettlementAt: null };
  }
  await connectDB();
  const [orderCount, oldest, meta] = await Promise.all([
    TrendyolOrderModel.estimatedDocumentCount(),
    TrendyolOrderModel.findOne({ packageCreationDate: { $exists: true } })
      .sort({ packageCreationDate: 1 })
      .select({ packageCreationDate: 1 })
      .lean(),
    getTrendyolArchiveMeta(),
  ]);
  return {
    configured: true,
    orderCount,
    oldestOrderAt: oldest?.packageCreationDate ? new Date(oldest.packageCreationDate).getTime() : null,
    lastSyncAt: meta.lastSyncAt ?? null,
    lastSettlementAt: meta.lastSettlementAt ?? null,
  };
}

// "Güncelle" butonu: son değişen paketler + settlement'ı hemen çeker.
export async function syncTrendyolArchiveNow(): Promise<{ ok: boolean; error?: string }> {
  if (!trendyolConfigured()) return { ok: false, error: "Trendyol entegrasyonu tanımlı değil" };
  try {
    await ensureTrendyolArchiveFresh({ force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Senkron başarısız" };
  }
}

// "Geçmişi yükle": UI bu fonksiyonu parça parça çağırır (chunkIndex 0,1,2…).
// Her parça bugünden geriye 15 günlük bir pencere. Uzun işlem tek istekte
// zaman aşımına düşmesin diye bölünmüştür.
const BACKFILL_CHUNK_DAYS = 15;

// Trendyol /packages yaklaşık son 1 ayı verir; daha eski aralığı BindError
// ("startDate must not be greater than endDate") ile reddeder → sınır sayılır.
export async function backfillTrendyolArchiveChunk(
  chunkIndex: number,
): Promise<{
  ok: boolean;
  packages: number;
  settled: number;
  from: number;
  reachedLimit?: boolean;
  error?: string;
}> {
  const todayEnd = istanbulDayStart().getTime() + DAY_MS;
  const end = todayEnd - chunkIndex * BACKFILL_CHUNK_DAYS * DAY_MS;
  const start = end - BACKFILL_CHUNK_DAYS * DAY_MS;
  if (!trendyolConfigured()) {
    return { ok: false, packages: 0, settled: 0, from: start, error: "Trendyol entegrasyonu tanımlı değil" };
  }
  try {
    const r = await backfillTrendyolRange(start, Math.min(end, Date.now()));
    return { ok: true, ...r, from: start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Geçmiş yüklenemedi";
    if (/startDate must not be greater than endDate/i.test(msg)) {
      return { ok: true, packages: 0, settled: 0, from: start, reachedLimit: true };
    }
    return { ok: false, packages: 0, settled: 0, from: start, error: msg };
  }
}

// ─── Yorumlar için sipariş → müşteri eşlemesi ────────────────────────────────
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
  preparationTime: number; // dakika
  totalPrice: number;
  packageStatus: string;
  deliveryType: string;
  deliveryDurationMin: number | null;
  courier: string | null;
  lines: TrendyolCustomerLine[];
}

export async function getCustomersByOrderNumbers(
  orderNumbers: string[],
): Promise<Map<string, TrendyolCustomerSummary>> {
  const out = new Map<string, TrendyolCustomerSummary>();
  if (orderNumbers.length === 0) return out;

  try {
    await ensureTrendyolArchiveFresh();
    await connectDB();
    const docs = await TrendyolOrderModel.find({ orderNumber: { $in: orderNumbers } }).lean();
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
        packageCreationDate: d.packageCreationDate ? new Date(d.packageCreationDate).getTime() : null,
        packageModificationDate: d.packageModificationDate
          ? new Date(d.packageModificationDate).getTime()
          : null,
        preparationTime: d.preparationTime ?? 0,
        totalPrice: d.totalPrice ?? 0,
        packageStatus: d.packageStatus ?? "",
        deliveryType: d.deliveryType ?? "",
        deliveryDurationMin: d.deliveryDurationMin ?? null,
        courier: d.courier ?? null,
        lines: (d.lines ?? []).map((l) => ({
          productId: l.productId ?? undefined,
          name: l.name ?? "",
          quantity: l.quantity ?? 1,
          unitSellingPrice: l.unitSellingPrice ?? 0,
        })),
      });
    }
  } catch {
    // DB erişilemezse zenginleştirme yok, sayfa yine çalışmalı
  }
  return out;
}

// ─── KVKK silme talebi ───────────────────────────────────────────────────────
export interface ForgetResult {
  ok: boolean;
  deleted: number;
  error?: string;
}

// Müşterinin kişisel verisi silinir; sipariş anonim istatistik olarak kalır.
export async function forgetCustomer(orderNumber: string): Promise<ForgetResult> {
  if (!orderNumber) return { ok: false, deleted: 0, error: "orderNumber boş" };
  try {
    const n = await anonymizeTrendyolOrders([orderNumber]);
    return { ok: true, deleted: n };
  } catch (err) {
    return { ok: false, deleted: 0, error: err instanceof Error ? err.message : "Silme hatası" };
  }
}

// ─── Trendyol sadakat (devamlı müşteri) ──────────────────────────────────────
export interface TrendyolLoyalty {
  available: boolean;
  totalCustomers: number; // arşivdeki benzersiz müşteri
  activeInPeriod: number;
  newInPeriod: number; // ilk siparişi bu dönem
  returningInPeriod: number;
  repeatRate: number; // 2+ siparişli müşteri oranı (%)
  atRisk: number; // son siparişi 30–90 gün önce
  lost: number; // son siparişi 90+ gün önce
  archiveSince: number | null; // "yeni" tespiti bu tarihten itibaren güvenilir
}

export async function getTrendyolLoyalty(
  period: DashboardPeriod = "day",
  dayOffset = 0,
): Promise<TrendyolLoyalty> {
  const empty: TrendyolLoyalty = {
    available: false,
    totalCustomers: 0,
    activeInPeriod: 0,
    newInPeriod: 0,
    returningInPeriod: 0,
    repeatRate: 0,
    atRisk: 0,
    lost: 0,
    archiveSince: null,
  };
  if (!trendyolConfigured()) return empty;

  try {
    await ensureTrendyolArchiveFresh();
    await connectDB();
    const w = periodWindows(period, dayOffset);
    const now = Date.now();

    const [rows, oldest] = await Promise.all([
      TrendyolOrderModel.aggregate<{
        _id: number;
        first: Date;
        last: Date;
        count: number;
        inPeriod: number;
      }>([
        {
          $match: {
            customerId: { $gt: 0 },
            packageStatus: { $nin: NON_REVENUE },
            packageCreationDate: { $exists: true },
          },
        },
        {
          $group: {
            _id: "$customerId",
            first: { $min: "$packageCreationDate" },
            last: { $max: "$packageCreationDate" },
            count: { $sum: 1 },
            inPeriod: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$packageCreationDate", new Date(w.start)] },
                      { $lt: ["$packageCreationDate", new Date(w.end)] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      TrendyolOrderModel.findOne({ packageCreationDate: { $exists: true } })
        .sort({ packageCreationDate: 1 })
        .select({ packageCreationDate: 1 })
        .lean(),
    ]);

    let active = 0;
    let fresh = 0;
    let repeat = 0;
    let atRisk = 0;
    let lost = 0;
    for (const r of rows) {
      if (r.count >= 2) repeat++;
      if (r.inPeriod > 0) {
        active++;
        const first = new Date(r.first).getTime();
        if (first >= w.start && first < w.end) fresh++;
      }
      const idle = now - new Date(r.last).getTime();
      if (idle >= 90 * DAY_MS) lost++;
      else if (idle >= 30 * DAY_MS) atRisk++;
    }

    return {
      available: true,
      totalCustomers: rows.length,
      activeInPeriod: active,
      newInPeriod: fresh,
      returningInPeriod: Math.max(0, active - fresh),
      repeatRate: rows.length > 0 ? (repeat / rows.length) * 100 : 0,
      atRisk,
      lost,
      archiveSince: oldest?.packageCreationDate
        ? new Date(oldest.packageCreationDate).getTime()
        : null,
    };
  } catch (err) {
    console.warn("[trendyol loyalty]", err);
    return empty;
  }
}

// ─── Tek sipariş detayı (Komuta sipariş listelerinden tıklanınca) ─────────────
export interface TrendyolOrderDetail {
  orderNumber: string;
  status: string;
  deliveryType: string;
  createdAt: number | null;
  deliveredAt: number | null;
  deliveryDurationMin: number | null;
  deliveryTimeSource: string | null;
  courier: string | null;
  customerName: string;
  phone: string;
  customerId: number | null;
  neighborhood: string;
  district: string;
  city: string;
  street: string; // cadde/sokak/no
  building: string; // "Bina 5, Kat 2, Daire 7"
  addressDescription: string;
  lat: number | null;
  lng: number | null;
  lines: { name: string; quantity: number; unitPrice: number; total: number }[];
  gross: number; // brüt (indirim öncesi)
  sellerDiscount: number; // senin karşıladığın indirim
  paid: number; // müşterinin ödediği
  paymentLabel: string;
  commission: number | null; // settlement'tan (gerçek)
  net: number; // sana yatacak (hakediş)
  netEstimated: boolean;
  // Müşterinin arşivdeki geçmişi
  customerOrderCount: number;
  customerTotal: number;
  customerFirstOrderAt: number | null;
}

export async function getTrendyolOrderDetail(orderNumber: string): Promise<TrendyolOrderDetail | null> {
  if (!orderNumber) return null;
  await connectDB();
  const d = await TrendyolOrderModel.findOne({ orderNumber }).lean();
  if (!d) return null;

  const { net, estimated } = archivedNet(d);
  const cancelled = NON_REVENUE_STATUSES.has(d.packageStatus ?? "");

  let history = { count: 0, total: 0, first: null as number | null };
  if (d.customerId) {
    const [h] = await TrendyolOrderModel.aggregate<{ count: number; total: number; first: Date }>([
      { $match: { customerId: d.customerId, packageStatus: { $nin: NON_REVENUE } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ["$totalPrice", 0] } },
          first: { $min: "$packageCreationDate" },
        },
      },
    ]);
    if (h) history = { count: h.count, total: h.total, first: h.first ? new Date(h.first).getTime() : null };
  }

  const key = d.paymentKey ?? "";
  const paymentLabel =
    key === "meal_card" && d.mealCardBrand
      ? `Yemek Kartı · ${d.mealCardBrand}`
      : (PAYMENT_LABEL[key] ?? "—");

  return {
    orderNumber: d.orderNumber,
    status: d.packageStatus ?? "",
    deliveryType: d.deliveryType ?? "",
    createdAt: d.packageCreationDate ? new Date(d.packageCreationDate).getTime() : null,
    deliveredAt: d.deliveredAt ? new Date(d.deliveredAt).getTime() : null,
    deliveryDurationMin: d.deliveryDurationMin ?? null,
    deliveryTimeSource: d.deliveryTimeSource ?? null,
    courier: d.courier ?? null,
    customerName: d.customerName || "—",
    phone: d.phone ?? "",
    customerId: d.customerId ?? null,
    neighborhood: d.neighborhood ?? "",
    district: d.district ?? "",
    city: d.city ?? "",
    street: d.street ?? "",
    building: [
      d.apartmentNumber ? `Bina ${d.apartmentNumber}` : null,
      d.floor ? `Kat ${d.floor}` : null,
      d.doorNumber ? `Daire ${d.doorNumber}` : null,
    ]
      .filter(Boolean)
      .join(", "),
    addressDescription: d.addressDescription ?? "",
    lat: d.lat ?? null,
    lng: d.lng ?? null,
    lines: (d.lines ?? []).map((l) => ({
      name: l.name ?? "",
      quantity: l.quantity ?? 1,
      unitPrice: l.unitSellingPrice ?? 0,
      total: (l.unitSellingPrice ?? 0) * (l.quantity ?? 1),
    })),
    gross: d.totalPrice ?? 0,
    sellerDiscount: d.sellerDiscount ?? 0,
    paid: d.netTotal ?? d.totalPrice ?? 0,
    paymentLabel,
    commission: d.commissionAmount ?? null,
    net: cancelled ? 0 : net,
    netEstimated: cancelled ? false : estimated,
    customerOrderCount: history.count,
    customerTotal: history.total,
    customerFirstOrderAt: history.first,
  };
}

// ─── Siparişler sayfası (/orders) ─────────────────────────────────────────────
// Trendyol siparişleri arşivden, sipariş kartının beklediği Order şekline
// çevrilerek döner. SALT OKUNUR: id "tyarch-" önekli → kart durum menüsü
// göstermez, "Detay" Trendyol panelini açar. Kendi sipariş deposuna (Zustand /
// Order koleksiyonu) KARIŞTIRILMAZ.
export type TrendyolListPeriod = "today" | "week" | "month" | "all";

const TY_STATUS: Record<string, Order["status"]> = {
  Created: "pending",
  Picking: "preparing",
  Invoiced: "preparing",
  Shipped: "on-the-way",
  Delivered: "delivered",
  Cancelled: "cancelled",
  UnSupplied: "cancelled",
};

const MEAL_BRANDS = new Set(["multinet", "setcard", "pluxee", "edenred", "tokenflex", "metropol"]);

export async function getTrendyolOrdersForList(period: TrendyolListPeriod = "week"): Promise<Order[]> {
  if (!trendyolConfigured()) return [];
  try {
    await ensureTrendyolArchiveFresh(period === "all" ? {} : { maxAgeMs: 60 * 1000 });
    await connectDB();
    const cutoff =
      period === "all"
        ? null
        : period === "today"
          ? istanbulDayStart()
          : new Date(Date.now() - (period === "week" ? 7 : 30) * DAY_MS);

    const docs = await TrendyolOrderModel.find(
      cutoff ? { packageCreationDate: { $gte: cutoff } } : { packageCreationDate: { $exists: true } },
    )
      .select({
        orderNumber: 1,
        packageStatus: 1,
        customerName: 1,
        phone: 1,
        neighborhood: 1,
        district: 1,
        city: 1,
        street: 1,
        floor: 1,
        doorNumber: 1,
        apartmentNumber: 1,
        addressDescription: 1,
        addressFull: 1,
        lat: 1,
        lng: 1,
        lines: 1,
        totalPrice: 1,
        netTotal: 1,
        paymentKey: 1,
        mealCardBrand: 1,
        courier: 1,
        packageCreationDate: 1,
        packageModificationDate: 1,
        deliveredAt: 1,
        deliveryDurationMin: 1,
        packageId: 1,
      })
      .sort({ packageCreationDate: -1 })
      .limit(2000)
      .lean();

    return docs.map((d): Order => {
      const created = d.packageCreationDate ? new Date(d.packageCreationDate) : new Date(0);
      const brand = (d.mealCardBrand ?? "").toLowerCase().split(" ")[0];
      const method = (["cash", "card", "online", "meal_card"] as const).find((m) => m === d.paymentKey) ?? "online";
      // Açık adres (street varsa); eski kayıtlarda yalnız mahalle/ilçe + tarif.
      const address =
        formatArchivedAddress(d) ||
        [[d.neighborhood, d.district].filter(Boolean).join(", "), d.addressDescription]
          .filter(Boolean)
          .join(" — ");
      return {
        id: `tyarch-${d.orderNumber}`,
        orderNumber: Number(d.orderNumber) || 0,
        items: (d.lines ?? []).map((l, i) => ({
          product: {
            id: `ty-${l.productId ?? i}`,
            name: l.name ?? "",
            price: l.unitSellingPrice ?? 0,
            category: "pide",
            available: true,
          },
          quantity: l.quantity ?? 1,
          totalPrice: (l.unitSellingPrice ?? 0) * (l.quantity ?? 1),
        })),
        customer: {
          name: d.customerName || "Trendyol müşterisi",
          phone: d.phone ?? "",
          address: address || "—",
          district: d.district || undefined,
          geo: d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : undefined,
        },
        payment: {
          method,
          mealCardBrand: MEAL_BRANDS.has(brand) ? (brand as NonNullable<Order["payment"]["mealCardBrand"]>) : undefined,
        },
        status: TY_STATUS[d.packageStatus ?? ""] ?? "pending",
        subtotal: d.totalPrice ?? 0,
        deliveryFee: 0,
        total: d.totalPrice ?? 0,
        source: "trendyol",
        externalRef: d.packageId ?? undefined,
        courier: d.courier ?? undefined,
        deliveredAt: d.deliveredAt ? new Date(d.deliveredAt) : undefined,
        deliveryDurationMin: d.deliveryDurationMin ?? undefined,
        createdAt: created,
        updatedAt: d.packageModificationDate ? new Date(d.packageModificationDate) : created,
      };
    });
  } catch (err) {
    console.warn("[trendyol orders list]", err);
    return [];
  }
}
