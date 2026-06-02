"use server";

// Trendyol GO Yemek menü listesini canlı çeker.
// Endpoint: GET /integrator/product/meal/suppliers/{supplierId}/stores/{storeId}/products
// storeId zorunlu — env'den (TRENDYOL_STORE_ID) ya da son paketlerden otomatik bulunur.
// Birden fazla mağaza varsa hepsi sırayla çekilir ve birleştirilir.

import {
  listTrendyolMenuProducts,
  listTrendyolPackages,
  updateTrendyolMealPrices,
  getTrendyolBatchRequestResult,
  type TrendyolMenuProduct,
  type TrendyolMenuSection,
  type TrendyolPriceUpdateItem,
} from "@/lib/integrations/trendyol/client";

export interface TrendyolMenuItem {
  productId: number;
  storeId: number;
  name: string;
  description?: string;
  price: number;
  originalPrice?: number;
  isActive: boolean;
  inStock: boolean;
  category?: string;
  imageUrl?: string;
  hasDiscount: boolean;
}

export interface TrendyolMenuResult {
  fetchedAt: string;
  source: "api" | "fallback";
  storeIds: number[];
  totalCount: number;
  activeCount: number;
  outOfStockCount: number;
  categories: { name: string; count: number }[];
  items: TrendyolMenuItem[];
  error?: string;
}

// Ürün -> Kategori eşlemesini sections'tan kur.
function buildProductCategoryMap(
  sections: TrendyolMenuSection[] | undefined,
): Map<number, string> {
  const map = new Map<number, string>();
  if (!sections) return map;
  for (const s of sections) {
    if (s.status && s.status.toUpperCase() !== "ACTIVE") continue;
    for (const ref of s.products ?? []) {
      if (!map.has(ref.id)) map.set(ref.id, s.name);
    }
  }
  return map;
}

// Trendyol Menu API response'unda field isimleri varyant gösteriyor olabilir:
// p.name bazen "1 Porsiyon" gibi variant adı oluyor; gerçek ürün adı productGroup
// ya da productName altında olabilir. Price da nested object dönebiliyor.
// Bu yüzden bilinen tüm alternatifleri sırayla dene.
function pickProductName(p: unknown, fallbackId: number): string {
  if (!p || typeof p !== "object") return `Ürün ${fallbackId}`;
  const o = p as Record<string, unknown>;
  const candidates: unknown[] = [
    (o.productGroup as Record<string, unknown> | undefined)?.name,
    o.productName,
    o.fullName,
    o.displayName,
    o.title,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  // En son fallback: p.name ama "1 Porsiyon" gibi generic varyantsa Ürün #id
  const fallback = typeof o.name === "string" ? o.name.trim() : "";
  const generic = /^\d+\s*porsiyon$/i.test(fallback) || fallback.length === 0;
  return generic ? `Ürün ${fallbackId}` : fallback;
}

function pickPrice(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["value", "amount", "sellingPrice", "price"]) {
      const v = o[key];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
  }
  return 0;
}

function extractPrices(p: unknown): { selling: number; original: number } {
  if (!p || typeof p !== "object") return { selling: 0, original: 0 };
  const o = p as Record<string, unknown>;
  const sellingCandidates = [
    o.sellingPrice,
    (o.price as Record<string, unknown> | undefined)?.sellingPrice,
    (o.price as Record<string, unknown> | undefined)?.selling,
    (o.prices as Record<string, unknown> | undefined)?.selling,
  ];
  const originalCandidates = [
    o.originalPrice,
    (o.price as Record<string, unknown> | undefined)?.originalPrice,
    (o.price as Record<string, unknown> | undefined)?.original,
    (o.prices as Record<string, unknown> | undefined)?.original,
  ];
  let selling = 0;
  for (const c of sellingCandidates) {
    selling = pickPrice(c);
    if (selling > 0) break;
  }
  let original = 0;
  for (const c of originalCandidates) {
    original = pickPrice(c);
    if (original > 0) break;
  }
  // Hiçbir spesifik field yoksa düz p.price'ı dene (number ya da object)
  if (selling === 0 && original === 0) {
    selling = pickPrice(o.price);
  }
  return { selling, original };
}

function normalize(
  p: TrendyolMenuProduct,
  storeId: number,
  categoryMap: Map<number, string>,
): TrendyolMenuItem {
  const { selling, original } = extractPrices(p);
  const price = selling > 0 ? selling : original;
  return {
    productId: p.id,
    storeId,
    name: pickProductName(p, p.id),
    description: p.description ?? undefined,
    price,
    originalPrice: original > 0 && original !== selling ? original : undefined,
    isActive: (p.status ?? "ACTIVE").toUpperCase() === "ACTIVE",
    inStock: true, // bu endpoint stok bilgisi vermiyor; varsayılan in-stock
    category: categoryMap.get(p.id),
    hasDiscount: selling > 0 && original > selling,
  };
}

// Env'den ya da son siparişlerden mağaza ID'lerini bul.
async function resolveStoreIds(): Promise<number[]> {
  // 1) Env'de tanımlıysa onu kullan (virgüllü liste destekli)
  const envStores = process.env.TRENDYOL_STORE_ID;
  if (envStores) {
    return envStores
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  // 2) Son 30 günün paketlerinden çıkar
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

export async function getTrendyolMenu(): Promise<TrendyolMenuResult> {
  const storeIds = await resolveStoreIds();

  if (storeIds.length === 0) {
    return await fallbackFromPackages(
      "Mağaza ID'si bulunamadı. TRENDYOL_STORE_ID env değişkenini ekleyin ya da en az 1 sipariş geçmişi gerekli.",
    );
  }

  try {
    const allItems: TrendyolMenuItem[] = [];
    const errors: string[] = [];

    for (const storeId of storeIds) {
      const res = await listTrendyolMenuProducts({ storeId });
      if (!res.ok) {
        errors.push(`Mağaza ${storeId}: ${res.status} ${res.error}`);
        continue;
      }
      const categoryMap = buildProductCategoryMap(res.data.sections);
      for (const p of res.data.products ?? []) {
        allItems.push(normalize(p, storeId, categoryMap));
      }
    }

    if (allItems.length === 0) {
      return await fallbackFromPackages(
        errors.length > 0
          ? `Menu API hatası: ${errors.join("; ")}`
          : "Menu API boş döndü",
      );
    }

    return buildResult(allItems, storeIds, "api", errors.length > 0 ? errors.join("; ") : undefined);
  } catch (err) {
    return await fallbackFromPackages(
      err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı",
    );
  }
}

// Fallback: son 30 günün paketlerinden ürünleri çıkar.
async function fallbackFromPackages(reason: string): Promise<TrendyolMenuResult> {
  try {
    const end = Date.now();
    const start = end - 30 * 24 * 60 * 60 * 1000;
    const map = new Map<string, TrendyolMenuItem>();
    const storeIds = new Set<number>();
    let page = 0;
    while (page < 20) {
      const res = await listTrendyolPackages({
        modificationStartDate: start,
        modificationEndDate: end,
        page,
        size: 50,
      });
      if (!res.ok) break;
      for (const pkg of res.data.content ?? []) {
        if (pkg.storeId) storeIds.add(pkg.storeId);
        for (const line of pkg.lines ?? []) {
          const key = String(line.productId);
          if (map.has(key)) continue;
          map.set(key, {
            productId: line.productId,
            storeId: pkg.storeId ?? 0,
            name: line.name,
            description: line.description ?? undefined,
            price: line.unitSellingPrice ?? line.price ?? 0,
            isActive: true,
            inStock: true,
            hasDiscount: false,
          });
        }
      }
      if (page + 1 >= (res.data.totalPages ?? 1)) break;
      page++;
    }
    const items = [...map.values()];
    const result = buildResult(items, [...storeIds], "fallback");
    result.error = reason;
    return result;
  } catch {
    return {
      fetchedAt: new Date().toISOString(),
      source: "fallback",
      storeIds: [],
      totalCount: 0,
      activeCount: 0,
      outOfStockCount: 0,
      categories: [],
      items: [],
      error: reason,
    };
  }
}

// ─── Fiyat güncelleme ──────────────────────────────────────────────────
// Sadece DEĞİŞEN fiyatlar gönderilmeli (Trendyol aynı body'yi tekrarlarsa
// "tekrarlı fiyat güncelleme" hatası verir). restaurantId göndermiyoruz →
// fiyat tüm restoranlara uygulanır (tek mağazalı satıcı için doğru davranış).

export interface PriceUpdateInput {
  productId: number;
  sellingPrice: number;
}

export interface PriceUpdateResponse {
  ok: boolean;
  batchRequestId?: string;
  error?: string;
}

export async function updateTrendyolPrices(
  items: PriceUpdateInput[],
): Promise<PriceUpdateResponse> {
  // Aynı ürün birden fazla kez geldiyse sonuncuyu al (duplicate productId'yi önle).
  const byId = new Map<number, number>();
  for (const it of items) {
    if (!Number.isFinite(it.productId) || it.productId <= 0) continue;
    if (!Number.isFinite(it.sellingPrice) || it.sellingPrice <= 0) continue;
    // 2 ondalık basamağa yuvarla (kuruş)
    byId.set(it.productId, Math.round(it.sellingPrice * 100) / 100);
  }

  const payload: TrendyolPriceUpdateItem[] = [...byId.entries()].map(
    ([productId, sellingPrice]) => ({ productId, sellingPrice }),
  );

  if (payload.length === 0) {
    return { ok: false, error: "Geçerli fiyat değişikliği yok." };
  }
  if (payload.length > 1000) {
    return { ok: false, error: "Tek seferde en fazla 1000 ürün güncellenebilir." };
  }

  try {
    const res = await updateTrendyolMealPrices(payload);
    if (!res.ok) {
      return { ok: false, error: `Trendyol: ${res.status} ${res.error}` };
    }
    const batchRequestId = res.data?.batchRequestId;
    if (!batchRequestId) {
      return { ok: false, error: "Trendyol batchRequestId döndürmedi." };
    }
    return { ok: true, batchRequestId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı",
    };
  }
}

export interface BatchItemResult {
  productId?: number;
  status: string;
  failureReasons: string[];
}

export interface BatchResultResponse {
  ok: boolean;
  completed: boolean;
  status?: string;
  itemCount?: number;
  failedItemCount?: number;
  items: BatchItemResult[];
  error?: string;
}

export async function getTrendyolPriceBatchResult(
  batchRequestId: string,
): Promise<BatchResultResponse> {
  try {
    const res = await getTrendyolBatchRequestResult(batchRequestId);
    if (!res.ok) {
      return {
        ok: false,
        completed: false,
        items: [],
        error: `Trendyol: ${res.status} ${res.error}`,
      };
    }
    const d = res.data;
    const status = d?.status;
    return {
      ok: true,
      completed: (status ?? "").toUpperCase() === "COMPLETED",
      status,
      itemCount: d?.itemCount,
      failedItemCount: d?.failedItemCount,
      items: (d?.items ?? []).map((it) => ({
        productId: it.requestItem?.productId ?? it.requestItem?.request?.productId,
        status: it.status ?? "UNKNOWN",
        failureReasons: it.failureReasons ?? [],
      })),
    };
  } catch (err) {
    return {
      ok: false,
      completed: false,
      items: [],
      error: err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı",
    };
  }
}

function buildResult(
  items: TrendyolMenuItem[],
  storeIds: number[],
  source: "api" | "fallback",
  warning?: string,
): TrendyolMenuResult {
  const catMap = new Map<string, number>();
  let activeCount = 0;
  let outOfStockCount = 0;
  for (const item of items) {
    if (item.isActive) activeCount++;
    if (!item.inStock) outOfStockCount++;
    const cat = item.category ?? "Kategorisiz";
    catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
  }
  const categories = [...catMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    fetchedAt: new Date().toISOString(),
    source,
    storeIds,
    totalCount: items.length,
    activeCount,
    outOfStockCount,
    categories,
    items: items.sort((a, b) => a.name.localeCompare(b.name, "tr")),
    error: warning,
  };
}
