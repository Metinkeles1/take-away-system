"use server";

// Paket adreslerinden bölgesel sipariş kırılımı.
// İlçe + mahalle aggregate'i ve harita için pin (lat/lng) listesi döner.

import {
  listTrendyolPackages,
  type TrendyolPackage,
} from "@/lib/integrations/trendyol/client";

export type TrendyolRegionPeriod = "today" | "week" | "month";

export interface RegionDistrict {
  name: string;
  count: number;
  revenue: number;
  neighborhoods: { name: string; count: number; revenue: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
}

export interface RegionPin {
  id: string;
  orderNumber: string;
  lat: number;
  lng: number;
  district?: string;
  neighborhood?: string;
  total: number;
  status: string;
  createdAt: number;
}

export interface TrendyolRegionStats {
  fetchedAt: string;
  rangeStart: number;
  rangeEnd: number;
  totalOrders: number;
  totalRevenue: number;
  withCoordinates: number;
  districts: RegionDistrict[];
  pins: RegionPin[];
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  error?: string;
}

const NON_REVENUE = new Set(["Cancelled", "UnSupplied"]);
const API_BUFFER_MS = 14 * 24 * 60 * 60 * 1000;

function periodRange(period: TrendyolRegionPeriod, ref?: number) {
  const now = new Date();
  const base = ref !== undefined ? new Date(ref) : now;
  const isToday =
    ref === undefined || new Date(ref).toDateString() === now.toDateString();
  const startOfRef = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const endOfRef = isToday
    ? now.getTime()
    : new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        23,
        59,
        59,
        999,
      ).getTime();
  if (period === "today") return { start: startOfRef.getTime(), end: endOfRef };
  const d = new Date(startOfRef);
  d.setDate(d.getDate() - (period === "week" ? 6 : 29));
  return { start: d.getTime(), end: endOfRef };
}

function parseCoord(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function normalizeName(s: string | undefined | null): string {
  if (!s) return "Bilinmiyor";
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bMAH\.?\b/gi, "Mah.")
    .replace(/\bMAHALLESI?\b/gi, "Mahallesi");
}

export async function getTrendyolRegions(
  period: TrendyolRegionPeriod = "today",
  referenceDate?: number,
): Promise<TrendyolRegionStats> {
  const { start, end } = periodRange(period, referenceDate);
  const apiStart = start - API_BUFFER_MS;

  const packages: TrendyolPackage[] = [];
  try {
    let page = 0;
    while (page < 200) {
      const res = await listTrendyolPackages({
        modificationStartDate: apiStart,
        modificationEndDate: end,
        page,
        size: 50,
      });
      if (!res.ok) {
        return {
          fetchedAt: new Date().toISOString(),
          rangeStart: start,
          rangeEnd: end,
          totalOrders: 0,
          totalRevenue: 0,
          withCoordinates: 0,
          districts: [],
          pins: [],
          error: `Trendyol API hatası (${res.status}): ${res.error}`,
        };
      }
      packages.push(...(res.data.content ?? []));
      if (page + 1 >= (res.data.totalPages ?? 1)) break;
      page++;
    }
  } catch (err) {
    return {
      fetchedAt: new Date().toISOString(),
      rangeStart: start,
      rangeEnd: end,
      totalOrders: 0,
      totalRevenue: 0,
      withCoordinates: 0,
      districts: [],
      pins: [],
      error: err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı",
    };
  }

  const filtered = packages.filter(
    (p) =>
      p.packageCreationDate >= start &&
      p.packageCreationDate <= end &&
      !NON_REVENUE.has(p.packageStatus),
  );

  // İlçe + mahalle aggregate
  const districtMap = new Map<
    string,
    {
      count: number;
      revenue: number;
      neighborhoods: Map<string, { count: number; revenue: number }>;
      products: Map<string, { quantity: number; revenue: number }>;
    }
  >();
  const pins: RegionPin[] = [];
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  let withCoordinates = 0;

  for (const p of filtered) {
    const district = normalizeName(p.address?.district);
    const neighborhood = normalizeName(p.address?.neighborhood);
    const revenue = p.totalPrice ?? 0;

    const cur = districtMap.get(district) ?? {
      count: 0,
      revenue: 0,
      neighborhoods: new Map<string, { count: number; revenue: number }>(),
      products: new Map<string, { quantity: number; revenue: number }>(),
    };
    cur.count++;
    cur.revenue += revenue;
    const nb = cur.neighborhoods.get(neighborhood) ?? { count: 0, revenue: 0 };
    nb.count++;
    nb.revenue += revenue;
    cur.neighborhoods.set(neighborhood, nb);
    for (const line of p.lines ?? []) {
      const qty = line.items?.length ?? 1;
      const unit = line.unitSellingPrice ?? line.price ?? 0;
      const pr = cur.products.get(line.name) ?? { quantity: 0, revenue: 0 };
      pr.quantity += qty;
      pr.revenue += unit * qty;
      cur.products.set(line.name, pr);
    }
    districtMap.set(district, cur);

    const lat = parseCoord(p.address?.latitude);
    const lng = parseCoord(p.address?.longitude);
    if (lat !== null && lng !== null) {
      withCoordinates++;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      pins.push({
        id: p.id,
        orderNumber: p.orderNumber,
        lat,
        lng,
        district: district !== "Bilinmiyor" ? district : undefined,
        neighborhood: neighborhood !== "Bilinmiyor" ? neighborhood : undefined,
        total: revenue,
        status: p.packageStatus,
        createdAt: p.packageCreationDate,
      });
    }
  }

  const districts: RegionDistrict[] = [...districtMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      revenue: v.revenue,
      neighborhoods: [...v.neighborhoods.entries()]
        .map(([n, nv]) => ({ name: n, count: nv.count, revenue: nv.revenue }))
        .sort((a, b) => b.count - a.count),
      topProducts: [...v.products.entries()]
        .map(([n, pv]) => ({ name: n, quantity: pv.quantity, revenue: pv.revenue }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    fetchedAt: new Date().toISOString(),
    rangeStart: start,
    rangeEnd: end,
    totalOrders: filtered.length,
    totalRevenue: filtered.reduce((s, p) => s + (p.totalPrice ?? 0), 0),
    withCoordinates,
    districts,
    pins,
    bounds:
      withCoordinates > 0
        ? { minLat, maxLat, minLng, maxLng }
        : undefined,
  };
}
