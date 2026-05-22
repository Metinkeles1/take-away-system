"use server";

// Trendyol değerlendirme/yorum verilerini çeker.
// İki ayrı endpoint kullanılır:
//   - /reviews/stats   → restoran ortalama puanları (multi-store ise ratingCount
//                       ağırlıklı birleştirme)
//   - /reviews/filter  → paginated yorum listesi (multi-store ise içerikler
//                       birleştirilir, createdDate desc sıralanır)

import { unstable_cache } from "next/cache";
import {
  listTrendyolReviewStats,
  listTrendyolReviews,
  listTrendyolPackages,
  type TrendyolReview,
  type TrendyolReviewStats,
  type TrendyolReviewAnswerStatus,
} from "@/lib/integrations/trendyol/client";
import {
  syncRecentCustomers,
  getCustomersByOrderNumbers,
  type TrendyolCustomerSummary,
} from "@/actions/trendyolCustomerSnapshot";

export type {
  TrendyolReview,
  TrendyolReviewStats,
  TrendyolReviewAnswerStatus,
} from "@/lib/integrations/trendyol/client";
export type { TrendyolCustomerSummary } from "@/actions/trendyolCustomerSnapshot";

// Bir review + (varsa) snapshot'tan gelen müşteri bilgisi.
export interface TrendyolReviewWithCustomer extends TrendyolReview {
  customer?: TrendyolCustomerSummary;
}

export interface TrendyolReviewStatsResult {
  available: boolean;
  stats: TrendyolReviewStats | null;
  storeIds: number[];
  error?: string;
}

export interface TrendyolReviewsListFilters {
  page?: number;
  size?: number;
  deliveryType?: "STORE" | "GO";
  startDate?: number;
  endDate?: number;
  hasComment?: boolean;
  hasRestaurantAnswer?: boolean;
  restaurantAnswerStatus?: TrendyolReviewAnswerStatus;
}

export interface TrendyolReviewsListResult {
  reviews: TrendyolReviewWithCustomer[];
  page: number;
  size: number;
  totalPages: number;
  totalCount: number;
  storeIds: number[];
  enrichedCount: number; // kaç review için müşteri snapshot'ı bulundu
  error?: string;
}

// Env veya son paketlerden mağaza ID'lerini çıkar. (trendyolMenu.ts ile aynı pattern;
// tekrar etmek yerine küçük bir kopya — Menu modülünü import etmek action coupling
// yaratır, basit kalsın.)
async function resolveStoreIds(): Promise<number[]> {
  const envStores = process.env.TRENDYOL_STORE_ID;
  if (envStores) {
    return envStores
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  try {
    const end = Date.now();
    const start = end - 30 * 24 * 60 * 60 * 1000;
    const stores = new Set<number>();
    let page = 0;
    while (page < 5 && stores.size === 0) {
      const res = await listTrendyolPackages({
        modificationStartDate: start,
        modificationEndDate: end,
        page,
        size: 50,
      });
      if (!res.ok) break;
      for (const p of res.data.content ?? []) {
        if (p.storeId) stores.add(p.storeId);
      }
      if (page + 1 >= (res.data.totalPages ?? 1)) break;
      page++;
    }
    return [...stores];
  } catch {
    return [];
  }
}

// Multi-store stats birleştirme. ratingCount ağırlıklı ortalama; çünkü
// /stats endpoint'i averageScores zaten o mağaza için ortalama —
// genel ortalama = Σ(score × ratingCount) / Σ(ratingCount).
function mergeStats(items: TrendyolReviewStats[]): TrendyolReviewStats | null {
  const valid = items.filter((s) => s.ratingCount > 0);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];

  let totalRatings = 0;
  let totalComments = 0;
  const acc = { overall: 0, flavor: 0, service: 0, delivery: 0 };

  for (const s of valid) {
    totalRatings += s.ratingCount;
    totalComments += s.commentCount;
    acc.overall += s.averageScores.overall * s.ratingCount;
    acc.flavor += s.averageScores.flavor * s.ratingCount;
    acc.service += s.averageScores.service * s.ratingCount;
    acc.delivery += s.averageScores.delivery * s.ratingCount;
  }

  return {
    averageScores: {
      overall: acc.overall / totalRatings,
      flavor: acc.flavor / totalRatings,
      service: acc.service / totalRatings,
      delivery: acc.delivery / totalRatings,
    },
    commentCount: totalComments,
    ratingCount: totalRatings,
  };
}

async function computeStats(): Promise<TrendyolReviewStatsResult> {
  const storeIds = await resolveStoreIds();
  if (storeIds.length === 0) {
    return {
      available: false,
      stats: null,
      storeIds: [],
      error: "Mağaza ID'si bulunamadı",
    };
  }

  const results = await Promise.all(
    storeIds.map((id) => listTrendyolReviewStats({ storeId: id })),
  );

  const collected: TrendyolReviewStats[] = [];
  const errors: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.ok) collected.push(r.data);
    else {
      // 404 = "Değerlendirme sayısı 3'ten az" — fail değil, sessiz geç.
      if (r.status !== 404) {
        errors.push(`Mağaza ${storeIds[i]}: ${r.status} ${r.error}`);
      }
    }
  }

  const merged = mergeStats(collected);
  return {
    available: merged !== null,
    stats: merged,
    storeIds,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

const cachedStats = unstable_cache(
  async () => computeStats(),
  ["trendyol-review-stats"],
  { revalidate: 300 }, // 5 dakika
);

export async function getTrendyolReviewStats(): Promise<TrendyolReviewStatsResult> {
  return cachedStats();
}

// ─── Reviews list ──────────────────────────────────────────────────
// Tek mağaza varsa endpoint'in kendi paginasyonu kullanılır. Birden fazla
// mağaza varsa her birinden aynı sayfa çekilip birleştirilir; pagination
// approximate (totalCount toplanır, ama sayfa numarası best-effort).

async function computeReviewsList(
  filters: TrendyolReviewsListFilters,
): Promise<TrendyolReviewsListResult> {
  const storeIds = await resolveStoreIds();
  if (storeIds.length === 0) {
    return {
      reviews: [],
      page: 0,
      size: filters.size ?? 20,
      totalPages: 0,
      totalCount: 0,
      storeIds: [],
      enrichedCount: 0,
      error: "Mağaza ID'si bulunamadı",
    };
  }

  const page = filters.page ?? 0;
  const size = filters.size ?? 20;

  const results = await Promise.all(
    storeIds.map((id) =>
      listTrendyolReviews({
        storeId: id,
        page,
        size,
        deliveryType: filters.deliveryType,
        startDate: filters.startDate,
        endDate: filters.endDate,
        hasComment: filters.hasComment,
        hasRestaurantAnswer: filters.hasRestaurantAnswer,
        restaurantAnswerStatus: filters.restaurantAnswerStatus,
      }),
    ),
  );

  const reviews: TrendyolReviewWithCustomer[] = [];
  let totalCount = 0;
  let totalPages = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.ok) {
      if (r.status !== 404) errors.push(`Mağaza ${storeIds[i]}: ${r.status} ${r.error}`);
      continue;
    }
    reviews.push(...(r.data.content ?? []));
    totalCount += r.data.totalElements ?? r.data.totalCount ?? r.data.content?.length ?? 0;
    totalPages = Math.max(totalPages, r.data.totalPages ?? 0);
  }

  reviews.sort((a, b) => b.createdDate - a.createdDate);

  return {
    reviews,
    page,
    size,
    totalPages,
    totalCount,
    storeIds,
    enrichedCount: 0,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

// Filter parametrelerini stable key'e çevir (cache discrimination için).
function filterKey(f: TrendyolReviewsListFilters): string {
  return [
    f.page ?? 0,
    f.size ?? 20,
    f.deliveryType ?? "",
    f.startDate ?? "",
    f.endDate ?? "",
    f.hasComment === undefined ? "" : f.hasComment ? "y" : "n",
    f.hasRestaurantAnswer === undefined ? "" : f.hasRestaurantAnswer ? "y" : "n",
    f.restaurantAnswerStatus ?? "",
  ].join("|");
}

const cachedList = unstable_cache(
  async (_key: string, filters: TrendyolReviewsListFilters) => computeReviewsList(filters),
  ["trendyol-reviews-list"],
  { revalidate: 300 },
);

export async function getTrendyolReviews(
  filters: TrendyolReviewsListFilters = {},
): Promise<TrendyolReviewsListResult> {
  // 1) Trendyol API'sinden cache'lenmiş listeyi al
  const base = await cachedList(filterKey(filters), filters);

  // 2) Müşteri snapshot DB'sini güncelle (rate-gated, 1 saat'te bir).
  //    DB write unstable_cache içinde yapılamaz → burada, cache dışında.
  //    Hata sessiz geçilir; enrichment olmasa da liste gösterilir.
  try {
    await syncRecentCustomers(30, false);
  } catch {
    // sync hatası enrichment'ı engellemesin
  }

  // 3) orderParentId → orderNumber join (Trendyol orderParentId long, packages
  //    orderNumber string; eşleştirme için String() ile normalize)
  const orderNumbers = base.reviews.map((r) => String(r.orderParentId));
  const customers = await getCustomersByOrderNumbers(orderNumbers);

  let enriched = 0;
  const reviewsWithCustomer = base.reviews.map((r) => {
    const c = customers.get(String(r.orderParentId));
    if (c) enriched++;
    return { ...r, customer: c };
  });

  return { ...base, reviews: reviewsWithCustomer, enrichedCount: enriched };
}

// Manuel "Senkronla" butonu için — rate gate'i atlatır.
export async function forceSyncCustomers(daysBack = 30) {
  return syncRecentCustomers(daysBack, true);
}
