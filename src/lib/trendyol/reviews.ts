import "server-only";

// Trendyol müşteri değerlendirmeleri — çekme ve sipariş arşivine yazma.
//
// Değerlendirme, siparişin arşiv kaydına (TrendyolOrder.review) yazılır; böylece
// sipariş detayında "müşteri ne dedi" görünür ve Trendyol eski yorumları
// vermeyi bıraksa da kaybolmaz. Eşleştirme: review.orderParentId = orderNumber.
//
// Senkron sayfa açılınca rate-gated çalışır (cron yok). Her seferinde tüm
// yorumlar çekilir (Değerlendirmeler sayfasıyla aynı yol): Trendyol'un tarih
// filtresi denenmedi ve varsayılan sıralaması güvenilmez; böylece geç gelen
// yorum ve sonradan değişen restoran cevabı da yakalanır.

import { connectDB } from "@/lib/mongodb";
import TrendyolOrderModel from "@/models/TrendyolOrder";
import SettingModel from "@/models/Setting";
import { trendyolConfigured } from "@/lib/trendyol/archive";
import {
  listTrendyolPackages,
  listTrendyolReviews,
  type TrendyolReview,
  type TrendyolReviewAnswerStatus,
} from "@/lib/integrations/trendyol/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const META_KEY = "trendyolReviewSync";
const REVIEW_MAX_AGE_MS = 30 * 60 * 1000;

// Env veya son paketlerden mağaza ID'lerini çıkar.
export async function resolveTrendyolStoreIds(): Promise<number[]> {
  const envStores = process.env.TRENDYOL_STORE_ID;
  if (envStores) {
    return envStores
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  try {
    const end = Date.now();
    const start = end - 30 * DAY_MS;
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

export interface ReviewFetchFilters {
  deliveryType?: "STORE" | "GO";
  startDate?: number;
  endDate?: number;
  hasComment?: boolean;
  hasRestaurantAnswer?: boolean;
  restaurantAnswerStatus?: TrendyolReviewAnswerStatus;
}

// Bir mağaza için tüm sayfaları çeker (50/sayfa).
//
// Trendyol response'unda `totalPages` her zaman güvenilir dönmüyor; döngünün
// durma koşulu birden fazla sinyale göre çalışır:
//   - content.length < SIZE  → son sayfa (kesin)
//   - totalPages varsa ve aşıldıysa → dur
//   - aksi halde MAX_PAGES güvenlik tavanına kadar devam et
export async function fetchAllReviewsForStore(
  storeId: number,
  filters: ReviewFetchFilters,
): Promise<{ ok: true; reviews: TrendyolReview[] } | { ok: false; status: number; error: string }> {
  const SIZE = 50;
  const MAX_PAGES = 50; // 50 × 50 = 2500 yorum (safety cap)
  const all: TrendyolReview[] = [];

  let page = 0;
  while (page < MAX_PAGES) {
    // Alanlar tek tek: çağıranın nesnesindeki page/size buraya sızmasın.
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
      // İlk sayfa başarısızsa hata; sonrakilerde o ana kadar toplananla yetin.
      if (page === 0) return { ok: false, status: res.status, error: res.error };
      break;
    }
    const content = res.data.content ?? [];
    all.push(...content);
    if (content.length < SIZE) break;
    const totalPages = res.data.totalPages;
    if (typeof totalPages === "number" && page + 1 >= totalPages) break;
    page++;
  }
  return { ok: true, reviews: all };
}

// Yorumları ilgili siparişlerin arşiv kaydına yazar (yalnız $set review;
// arşivde olmayan siparişe kayıt açılmaz). Yazılan sipariş sayısını döner.
export async function writeReviewsToArchive(reviews: TrendyolReview[]): Promise<number> {
  if (reviews.length === 0) return 0;
  await connectDB();
  const ops = reviews.map((r) => ({
    updateOne: {
      filter: { orderNumber: String(r.orderParentId) },
      update: {
        $set: {
          review: {
            reviewId: r.reviewId,
            flavor: r.rating?.flavorScore,
            service: r.rating?.serviceScore,
            delivery: r.rating?.deliveryScore,
            average: r.rating?.average,
            comment: r.comment?.text?.trim() || undefined,
            answer: r.comment?.restaurantAnswer?.text?.trim() || undefined,
            answerStatus: r.comment?.restaurantAnswer?.status,
            createdAt: r.createdDate ? new Date(r.createdDate) : undefined,
          },
        },
      },
    },
  }));
  const res = await TrendyolOrderModel.bulkWrite(
    ops as Parameters<typeof TrendyolOrderModel.bulkWrite>[0],
    { ordered: false },
  );
  return res.matchedCount;
}

// lastAttemptAt: başarısız denemeler de bekleme süresine sayılır → Trendyol
// cevap vermezken her sipariş açılışında yeniden istek atılmaz.
async function readLastAttempt(): Promise<number | undefined> {
  const doc = (await SettingModel.findOne({ key: META_KEY }).lean()) as {
    value?: { lastAttemptAt?: number };
  } | null;
  return doc?.value?.lastAttemptAt;
}

async function writeMeta(set: Record<string, number>): Promise<void> {
  const patch = Object.fromEntries(Object.entries(set).map(([k, v]) => [`value.${k}`, v]));
  await SettingModel.updateOne({ key: META_KEY }, { $set: patch }, { upsert: true });
}

// Rate-gated yorum senkronu. Hata okumayı engellemez; eşzamanlı çağrılar
// tek senkrona bağlanır.
let inflight: Promise<void> | null = null;

export async function ensureTrendyolReviewsFresh(opts: { force?: boolean } = {}): Promise<void> {
  if (!trendyolConfigured()) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await connectDB();
      const last = await readLastAttempt();
      const now = Date.now();
      if (!opts.force && last && now - last < REVIEW_MAX_AGE_MS) return;
      await writeMeta({ lastAttemptAt: now });

      const storeIds = await resolveTrendyolStoreIds();
      if (storeIds.length === 0) return;
      const results = await Promise.all(storeIds.map((id) => fetchAllReviewsForStore(id, {})));
      const reviews = results.flatMap((r) => (r.ok ? r.reviews : []));
      // 404 = mağazada 3'ten az yorum var; hata değil.
      if (!results.some((r) => r.ok || r.status === 404)) return;
      await writeReviewsToArchive(reviews);
      await writeMeta({ lastSyncAt: now });
    } catch (err) {
      console.warn("[trendyol reviews] senkron başarısız", err);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
