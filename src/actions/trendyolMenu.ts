"use server";

// Trendyol GO Yemek menü listesini canlı çeker.
// Endpoint: GET /integrator/product/meal/suppliers/{supplierId}/stores/{storeId}/products
// storeId zorunlu — env'den (TRENDYOL_STORE_ID) ya da son paketlerden otomatik bulunur.
// Birden fazla mağaza varsa hepsi sırayla çekilir ve birleştirilir.

import {
  listTrendyolMenuProducts,
  listTrendyolPackages,
  type TrendyolMenuProduct,
  type TrendyolMenuSection,
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

function normalize(
  p: TrendyolMenuProduct,
  storeId: number,
  categoryMap: Map<number, string>,
): TrendyolMenuItem {
  const sellingPrice = p.sellingPrice ?? 0;
  const originalPrice = p.originalPrice ?? 0;
  const price = sellingPrice > 0 ? sellingPrice : originalPrice;
  return {
    productId: p.id,
    storeId,
    name: p.name,
    description: p.description ?? undefined,
    price,
    originalPrice: originalPrice > 0 && originalPrice !== sellingPrice ? originalPrice : undefined,
    isActive: (p.status ?? "ACTIVE").toUpperCase() === "ACTIVE",
    inStock: true, // bu endpoint stok bilgisi vermiyor; varsayılan in-stock
    category: categoryMap.get(p.id),
    hasDiscount: sellingPrice > 0 && originalPrice > sellingPrice,
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
