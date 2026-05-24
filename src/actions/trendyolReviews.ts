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
//
// Trendyol /reviews/filter endpoint'i sıralama parametresi belgelemiyor ve
// default sıralama yönü API'den API'ye değişebiliyor — pratikte page 0 en
// ESKİ yorumları döndürebilir ve kullanıcı "son kötü yorum" gibi en yeni
// kayıtları kaçırır. Bu yüzden:
//   1. Mağaza başına TÜM sayfaları çekiyoruz (max 50/sayfa).
//   2. Birleştirip createdDate DESC sıralıyoruz (gerçek "son yorum" üstte).
//   3. Pagination'ı client-side yapıyoruz.
// Cache: page hariç filtreler bazında — aynı filtre kombinasyonu sayfalar
// arası tek API turundan yararlanır.

// Bir mağaza için tüm sayfaları çeker (paginated loop, 50/sayfa).
//
// Trendyol response'unda `totalPages` her zaman güvenilir dönmüyor; ona göre
// "ilk sayfadan sonra dur" gibi vakalarda yorumların büyük kısmını kaçırdık.
// Bu yüzden döngünün durma koşulu birden fazla sinyale göre çalışır:
//   - content.length < SIZE  → son sayfa (kesin)
//   - totalPages varsa ve aşıldıysa → dur
//   - aksi halde MAX_PAGES güvenlik tavanına kadar devam et
async function fetchAllReviewsForStore(
  storeId: number,
  filters: Omit<TrendyolReviewsListFilters, "page" | "size">,
): Promise<{ ok: true; reviews: TrendyolReview[] } | { ok: false; status: number; error: string }> {
  const SIZE = 50;
  const MAX_PAGES = 50; // 50 × 50 = 2500 yorum (safety cap)
  const all: TrendyolReview[] = [];

  let page = 0;
  while (page < MAX_PAGES) {
    const res = await listTrendyolReviews({
      storeId,
      page,
      size: SIZE,
      deliveryType: filters.deliveryType,
      startDate: filters.startDate,
      endDate: filters.endDate,
      hasComment: filters.hasComment,
      hasRestaurantAnswer: filters.hasRestaurantAnswer,
      restaurantAnswerStatus: filters.restaurantAnswerStatus,
    });
    if (!res.ok) {
      // İlk sayfa başarısızsa hata; sonraki sayfalar başarısızsa o ana kadar
      // toplanmış yorumlarla yetin (kısmi veri > hiç veri).
      if (page === 0) {
        return { ok: false, status: res.status, error: res.error };
      }
      break;
    }
    const content = res.data.content ?? [];
    all.push(...content);

    // Birincil durma sinyali: dönen kayıt SIZE'dan az → son sayfa
    if (content.length < SIZE) break;

    // İkincil: totalPages mevcut ve aşıldıysa dur
    const totalPages = res.data.totalPages;
    if (typeof totalPages === "number" && page + 1 >= totalPages) break;

    page++;
  }
  return { ok: true, reviews: all };
}

async function computeReviewsList(
  filters: TrendyolReviewsListFilters,
): Promise<TrendyolReviewsListResult> {
  const storeIds = await resolveStoreIds();
  const size = filters.size ?? 20;
  const page = filters.page ?? 0;

  if (storeIds.length === 0) {
    return {
      reviews: [],
      page,
      size,
      totalPages: 0,
      totalCount: 0,
      storeIds: [],
      enrichedCount: 0,
      error: "Mağaza ID'si bulunamadı",
    };
  }

  const results = await Promise.all(
    storeIds.map((id) => fetchAllReviewsForStore(id, filters)),
  );

  // reviewId bazlı dedup — multi-store fetch ya da pagination overlap
  // durumunda Trendyol aynı review'ı birden fazla kez döndürebiliyor;
  // React aynı key'i iki kere görürse warning veriyor.
  const seen = new Set<string>();
  const allReviews: TrendyolReview[] = [];
  const errors: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.ok) {
      if (r.status !== 404)
        errors.push(`Mağaza ${storeIds[i]}: ${r.status} ${r.error}`);
      continue;
    }
    for (const rev of r.reviews) {
      if (seen.has(rev.reviewId)) continue;
      seen.add(rev.reviewId);
      allReviews.push(rev);
    }
  }

  // Gerçek "en yeniden eskiye" sıralama — Trendyol'un default'una güvenmiyoruz.
  allReviews.sort((a, b) => b.createdDate - a.createdDate);

  const totalCount = allReviews.length;
  const totalPages = Math.ceil(totalCount / size);

  // Client-side dilim
  const start = page * size;
  const slice = allReviews.slice(start, start + size);

  return {
    reviews: slice,
    page,
    size,
    totalPages,
    totalCount,
    storeIds,
    enrichedCount: 0,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

// Filter parametrelerini stable key'e çevir (page HARİÇ — pagination client-side).
function filterKey(f: TrendyolReviewsListFilters): string {
  return [
    f.deliveryType ?? "",
    f.startDate ?? "",
    f.endDate ?? "",
    f.hasComment === undefined ? "" : f.hasComment ? "y" : "n",
    f.hasRestaurantAnswer === undefined ? "" : f.hasRestaurantAnswer ? "y" : "n",
    f.restaurantAnswerStatus ?? "",
  ].join("|");
}

// Cache, page-bağımsız tüm yorumları tutar. getTrendyolReviews içinde
// page+size'a göre dilimleme yapılır (kachable scope dışında).
// NOT: key'e "v2" eklendi — dedup öncesi eski cache invalidate edilsin.
const cachedAllReviews = unstable_cache(
  async (_key: string, filters: TrendyolReviewsListFilters) => {
    // page/size'ı sıfırla — cache her zaman tüm listeyi içersin
    return computeReviewsList({ ...filters, page: 0, size: 100000 });
  },
  ["trendyol-reviews-all-v3"],
  { revalidate: 300 },
);

export async function getTrendyolReviews(
  filters: TrendyolReviewsListFilters = {},
): Promise<TrendyolReviewsListResult> {
  const page = filters.page ?? 0;
  const size = filters.size ?? 20;

  // 1) Tüm yorumları cache'ten al (page-bağımsız)
  const full = await cachedAllReviews(filterKey(filters), filters);

  // 2) İstenen sayfayı dilimle
  const all = full.reviews;
  const totalCount = all.length;
  const totalPages = Math.ceil(totalCount / size);
  const start = page * size;
  const slice = all.slice(start, start + size);

  const base: TrendyolReviewsListResult = {
    reviews: slice,
    page,
    size,
    totalPages,
    totalCount,
    storeIds: full.storeIds,
    enrichedCount: 0,
    error: full.error,
  };

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
