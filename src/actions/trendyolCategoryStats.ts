"use server";

// Trendyol kategori bazlı satış istatistikleri.
// Menu API'den productId → kategori map'i kurup, packages'taki line.productId
// üzerinden adet/ciro/sipariş sayısı toplar. trendyolDashboard.ts ile aynı
// period semantikleri (today/week/month + referans tarih) ve API tampon mantığı.

import { unstable_cache } from "next/cache";
import {
  listTrendyolPackages,
  listTrendyolMenuProducts,
  type TrendyolPackage,
  type TrendyolMenuSection,
} from "@/lib/integrations/trendyol/client";
import { istanbulDayStart } from "@/lib/datetime";

const DAY_MS = 24 * 60 * 60 * 1000;
const API_BUFFER_MS = 14 * DAY_MS;
const NON_REVENUE_STATUSES = new Set(["Cancelled", "UnSupplied"]);

export type TrendyolPeriod = "today" | "week" | "month";

export interface TrendyolCategoryRow {
  name: string;
  quantity: number;
  revenue: number;
  orderCount: number;
  productCount: number;
}

export interface TrendyolCategoryStats {
  period: TrendyolPeriod;
  fetchedAt: string;
  rangeStart: number;
  rangeEnd: number;
  totalQuantity: number;
  totalRevenue: number;
  totalOrders: number;
  categories: TrendyolCategoryRow[];
  menuAvailable: boolean;
  error?: string;
}

function periodRange(
  period: TrendyolPeriod,
  referenceDate?: number,
): { start: number; end: number } {
  const now = Date.now();
  const refTs = referenceDate ?? now;
  const startOfRef = istanbulDayStart(refTs).getTime();
  const todayStart = istanbulDayStart(now).getTime();
  const isReferenceToday = startOfRef === todayStart;
  const endOfRef = isReferenceToday ? now : startOfRef + DAY_MS - 1;
  if (period === "today") return { start: startOfRef, end: endOfRef };
  const daysBack = period === "week" ? 6 : 29;
  return { start: startOfRef - daysBack * DAY_MS, end: endOfRef };
}

async function fetchAllPackages(
  start: number,
  end: number,
): Promise<{ ok: true; packages: TrendyolPackage[] } | { ok: false; error: string }> {
  const size = 50;
  const firstRes = await listTrendyolPackages({
    modificationStartDate: start,
    modificationEndDate: end,
    page: 0,
    size,
  });
  if (!firstRes.ok) {
    return { ok: false, error: `Trendyol API hatası (${firstRes.status}): ${firstRes.error}` };
  }
  const totalPages = Math.min(firstRes.data.totalPages ?? 1, 200);
  const packages: TrendyolPackage[] = [...(firstRes.data.content ?? [])];
  if (totalPages <= 1) return { ok: true, packages };

  const BATCH = 5;
  for (let pageStart = 1; pageStart < totalPages; pageStart += BATCH) {
    const pageNums = Array.from(
      { length: Math.min(BATCH, totalPages - pageStart) },
      (_, i) => pageStart + i,
    );
    const results = await Promise.all(
      pageNums.map((page) =>
        listTrendyolPackages({
          modificationStartDate: start,
          modificationEndDate: end,
          page,
          size,
        }),
      ),
    );
    for (const r of results) {
      if (!r.ok) return { ok: false, error: `Trendyol API hatası (${r.status}): ${r.error}` };
      packages.push(...(r.data.content ?? []));
    }
  }
  return { ok: true, packages };
}

async function buildProductCategoryMap(
  packages: TrendyolPackage[],
): Promise<{ map: Map<number, string>; ok: boolean; error?: string }> {
  const envStores = process.env.TRENDYOL_STORE_ID
    ?.split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const storeIds = envStores && envStores.length > 0
    ? envStores
    : [...new Set(packages.map((p) => p.storeId).filter((id): id is number => !!id))];

  if (storeIds.length === 0) {
    return { map: new Map(), ok: false, error: "Mağaza ID'si bulunamadı" };
  }

  const map = new Map<number, string>();
  const errors: string[] = [];

  for (const storeId of storeIds) {
    const res = await listTrendyolMenuProducts({ storeId });
    if (!res.ok) {
      errors.push(`Mağaza ${storeId}: ${res.status} ${res.error}`);
      continue;
    }
    const sections: TrendyolMenuSection[] = res.data.sections ?? [];
    for (const s of sections) {
      if (s.status && s.status.toUpperCase() !== "ACTIVE") continue;
      for (const ref of s.products ?? []) {
        if (!map.has(ref.id)) map.set(ref.id, s.name);
      }
    }
  }

  return {
    map,
    ok: map.size > 0,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

function dateKey(referenceDate?: number): string {
  const start = istanbulDayStart(referenceDate ?? Date.now());
  const istMs = start.getTime() + 3 * 60 * 60 * 1000;
  const d = new Date(istMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isReferenceToday(referenceDate?: number): boolean {
  if (referenceDate === undefined) return true;
  return istanbulDayStart(referenceDate).getTime() === istanbulDayStart().getTime();
}

async function computeCategoryStats(
  period: TrendyolPeriod,
  referenceDate?: number,
): Promise<TrendyolCategoryStats> {
  const { start, end } = periodRange(period, referenceDate);
  const pkgRes = await fetchAllPackages(start - API_BUFFER_MS, end);

  if (!pkgRes.ok) {
    return {
      period,
      fetchedAt: new Date().toISOString(),
      rangeStart: start,
      rangeEnd: end,
      totalQuantity: 0,
      totalRevenue: 0,
      totalOrders: 0,
      categories: [],
      menuAvailable: false,
      error: pkgRes.error,
    };
  }

  const packages = pkgRes.packages.filter(
    (p) =>
      p.packageCreationDate >= start &&
      p.packageCreationDate <= end &&
      !NON_REVENUE_STATUSES.has(p.packageStatus),
  );

  const catRes = await buildProductCategoryMap(packages);

  type Acc = {
    quantity: number;
    revenue: number;
    orderIds: Set<string>;
    productIds: Set<number>;
  };
  const catMap = new Map<string, Acc>();

  for (const p of packages) {
    for (const line of p.lines ?? []) {
      const cat = catRes.map.get(line.productId) ?? "Kategorisiz";
      const qty = line.items?.length ?? 1;
      const unit = line.unitSellingPrice ?? line.price ?? 0;
      const cur = catMap.get(cat) ?? {
        quantity: 0,
        revenue: 0,
        orderIds: new Set<string>(),
        productIds: new Set<number>(),
      };
      cur.quantity += qty;
      cur.revenue += unit * qty;
      cur.orderIds.add(p.id);
      cur.productIds.add(line.productId);
      catMap.set(cat, cur);
    }
  }

  const categories: TrendyolCategoryRow[] = [...catMap.entries()]
    .map(([name, v]) => ({
      name,
      quantity: v.quantity,
      revenue: v.revenue,
      orderCount: v.orderIds.size,
      productCount: v.productIds.size,
    }))
    .sort((a, b) => b.quantity - a.quantity);

  return {
    period,
    fetchedAt: new Date().toISOString(),
    rangeStart: start,
    rangeEnd: end,
    totalQuantity: categories.reduce((s, c) => s + c.quantity, 0),
    totalRevenue: categories.reduce((s, c) => s + c.revenue, 0),
    totalOrders: packages.length,
    categories,
    menuAvailable: catRes.ok,
    error: catRes.error,
  };
}

const cachedToday = unstable_cache(
  async (period: TrendyolPeriod, _key: string, refTs: number) =>
    computeCategoryStats(period, refTs),
  ["trendyol-category-stats-today"],
  { revalidate: 60 },
);

const cachedPast = unstable_cache(
  async (period: TrendyolPeriod, _key: string, refTs: number) =>
    computeCategoryStats(period, refTs),
  ["trendyol-category-stats-past"],
  { revalidate: 600 },
);

export async function getTrendyolCategoryStats(
  period: TrendyolPeriod = "today",
  referenceDate?: number,
): Promise<TrendyolCategoryStats> {
  const key = dateKey(referenceDate);
  const refTs = referenceDate ?? Date.now();
  const fn = isReferenceToday(referenceDate) ? cachedToday : cachedPast;
  return fn(period, key, refTs);
}
