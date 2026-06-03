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
  updateTrendyolProductStatus,
  updateTrendyolSectionStatus,
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
  category?: string; // birincil kategori (kart etiketi için)
  categories?: string[]; // ürünün ait olduğu TÜM kategoriler (çoklu kategori filtresi için)
  sectionId?: number; // kategori (section) id — aç/kapa için
  ingredients?: string[]; // çözümlenmiş malzeme adları
  modifiers?: string[]; // çözümlenmiş modifier grup adları (ör. "Çorbalar")
  imageUrl?: string;
  hasDiscount: boolean;
}

export interface TrendyolMenuSectionInfo {
  id: number;
  name: string;
  status: string; // ACTIVE | PASSIVE
  storeId: number;
}

export interface TrendyolMenuResult {
  fetchedAt: string;
  source: "api" | "fallback";
  storeIds: number[];
  totalCount: number;
  activeCount: number;
  outOfStockCount: number;
  categories: { name: string; count: number }[];
  sections: TrendyolMenuSectionInfo[];
  items: TrendyolMenuItem[];
  error?: string;
}

// Trendyol'un otomatik vitrin/kürasyon kategorileri — gerçek menü kategorisi değil,
// ürünleri tekrarlar. Kategori çiplerinde/filtrede gösterilmez. Yeni ad çıkarsa ekle.
const CURATED_SECTION_HINTS = [
  "en sevilen",
  "cok satan",
  "populer",
  "one cikan",
  "yeni eklenen",
  "kampanya",
  "firsat",
];

function normalizeTr(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("ç", "c")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s");
}

function isCuratedSection(name: string): boolean {
  const n = normalizeTr(name);
  return CURATED_SECTION_HINTS.some((h) => n.includes(h));
}

// Ürün -> ait olduğu TÜM gerçek kategoriler (bir ürün birden fazla section'da olabilir:
// ör. hem "Restoranın En Sevilenleri" hem "Kebaplar"). Vitrin kategorileri atlanır.
// İlk eleman birincil kategori (kart etiketi). Önce ACTIVE bölümler, sonra pasifler.
function buildProductCategoryMap(
  sections: TrendyolMenuSection[] | undefined,
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (!sections) return map;
  const isActive = (s: TrendyolMenuSection) =>
    (s.status ?? "ACTIVE").toUpperCase() === "ACTIVE";
  const add = (id: number, name: string) => {
    const arr = map.get(id);
    if (!arr) map.set(id, [name]);
    else if (!arr.includes(name)) arr.push(name);
  };
  for (const s of sections) {
    if (!isActive(s) || isCuratedSection(s.name)) continue;
    for (const ref of s.products ?? []) add(ref.id, s.name);
  }
  for (const s of sections) {
    if (isActive(s) || isCuratedSection(s.name)) continue;
    for (const ref of s.products ?? []) add(ref.id, s.name);
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

// Açıklama: alan adı yanıtta değişebiliyor (description / detail / productGroup.description).
function pickDescription(p: unknown): string | undefined {
  if (!p || typeof p !== "object") return undefined;
  const o = p as Record<string, unknown>;
  const candidates: unknown[] = [
    o.description,
    o.detail,
    o.summary,
    (o.productGroup as Record<string, unknown> | undefined)?.description,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return undefined;
}

// NOT: Trendyol GO Yemek menü API'si ürün GÖRSELİ döndürmüyor (dokümanda
// yanıtta resim alanı yok). Bu yüzden imageUrl set edilmez; kart placeholder gösterir.

function normalize(
  p: TrendyolMenuProduct,
  storeId: number,
  categoryMap: Map<number, string[]>,
  sectionIdMap: Map<number, number>,
  ingredientMap: Map<number, string>,
  modifierMap: Map<number, string>,
): TrendyolMenuItem {
  const { selling, original } = extractPrices(p);
  const price = selling > 0 ? selling : original;

  const ingredientIds = [...(p.ingredients ?? []), ...(p.extraIngredients ?? [])];
  const ingredients = ingredientIds
    .map((id) => ingredientMap.get(id))
    .filter((n): n is string => !!n);
  const modifiers = (p.modifierGroups ?? [])
    .map((m) => modifierMap.get(m.id))
    .filter((n): n is string => !!n);

  return {
    productId: p.id,
    storeId,
    name: pickProductName(p, p.id),
    description: pickDescription(p),
    price,
    originalPrice: original > 0 && original !== selling ? original : undefined,
    isActive: (p.status ?? "ACTIVE").toUpperCase() === "ACTIVE",
    inStock: true, // bu endpoint stok bilgisi vermiyor; varsayılan in-stock
    category: categoryMap.get(p.id)?.[0],
    categories: categoryMap.get(p.id),
    sectionId: sectionIdMap.get(p.id),
    ingredients: ingredients.length ? ingredients : undefined,
    modifiers: modifiers.length ? modifiers : undefined,
    hasDiscount: selling > 0 && original > selling,
  };
}

// Env'den ya da son siparişlerden mağaza ID'lerini bul.
async function resolveStoreIds(): Promise<number[]> {
  // 1) Env'de tanımlıysa onu kullan (virgüllü liste destekli)
  const envStores = process.env.TRENDYOL_STORE_ID;
  if (envStores) {
    const ids = envStores
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    // Aynı mağaza iki kez yazılmışsa ürünler ikilenmesin diye tekilleştir.
    return [...new Set(ids)];
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
    // productId bazında tekilleştir: aynı ürün birden fazla mağaza/section'da
    // dönebilir; eklenirse menü sayısı şişer (örn. 6 yerine 12 görünür).
    const byId = new Map<number, TrendyolMenuItem>();
    const sectionById = new Map<number, TrendyolMenuSectionInfo>();
    const errors: string[] = [];

    // Mağazaları paralel çek (çok mağazalı durumda sıralı await gecikmesini önler).
    const responses = await Promise.all(
      storeIds.map((storeId) =>
        listTrendyolMenuProducts({ storeId }).then((res) => ({ storeId, res })),
      ),
    );

    for (const { storeId, res } of responses) {
      if (!res.ok) {
        errors.push(`Mağaza ${storeId}: ${res.status} ${res.error}`);
        continue;
      }
      const data = res.data;
      const categoryMap = buildProductCategoryMap(data.sections);

      // Section id ↔ ürün eşlemesi + yönetim listesi (pasifler dahil, aç/kapa için).
      const sectionIdMap = new Map<number, number>();
      for (const s of data.sections ?? []) {
        if (!sectionById.has(s.id)) {
          sectionById.set(s.id, {
            id: s.id,
            name: s.name,
            status: (s.status ?? "ACTIVE").toUpperCase(),
            storeId,
          });
        }
        for (const ref of s.products ?? []) {
          if (!sectionIdMap.has(ref.id)) sectionIdMap.set(ref.id, s.id);
        }
      }

      // Malzeme/modifier id → ad çözümlemesi (opsiyon gösterimi için).
      const ingredientMap = new Map<number, string>();
      for (const ing of data.ingredients ?? []) ingredientMap.set(ing.id, ing.name);
      const modifierMap = new Map<number, string>();
      for (const mg of data.modifierGroups ?? []) modifierMap.set(mg.id, mg.name);

      for (const p of data.products ?? []) {
        const item = normalize(
          p,
          storeId,
          categoryMap,
          sectionIdMap,
          ingredientMap,
          modifierMap,
        );
        const existing = byId.get(item.productId);
        if (!existing) {
          byId.set(item.productId, item);
        } else {
          // Aynı ürün başka mağazada/section'da da olabilir → kategorileri birleştir.
          const mergedCats = Array.from(
            new Set([...(existing.categories ?? []), ...(item.categories ?? [])]),
          );
          byId.set(item.productId, {
            ...existing,
            category: existing.category ?? item.category,
            categories: mergedCats.length ? mergedCats : undefined,
            sectionId: existing.sectionId ?? item.sectionId,
          });
        }
      }
    }

    const allItems = [...byId.values()];

    if (allItems.length === 0) {
      return await fallbackFromPackages(
        errors.length > 0
          ? `Menu API hatası: ${errors.join("; ")}`
          : "Menu API boş döndü",
      );
    }

    return buildResult(
      allItems,
      storeIds,
      "api",
      [...sectionById.values()],
      errors.length > 0 ? errors.join("; ") : undefined,
    );
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
      sections: [],
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

// ─── Ürün / kategori satışa aç-kapa ────────────────────────────────────
// Senkron (200). 409 = eşzamanlı değişiklik → tekrar denenmeli.
export async function setTrendyolProductStatus(
  storeId: number,
  productId: number,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await updateTrendyolProductStatus({
      storeId,
      productId,
      status: active ? "ACTIVE" : "PASSIVE",
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 409
            ? "Eşzamanlı değişiklik oldu, tekrar deneyin."
            : `Trendyol: ${res.status} ${res.error}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı",
    };
  }
}

export async function setTrendyolSectionStatus(
  storeId: number,
  sectionId: number,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await updateTrendyolSectionStatus({
      storeId,
      sectionId,
      status: active ? "ACTIVE" : "PASSIVE",
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 409
            ? "Eşzamanlı değişiklik oldu, tekrar deneyin."
            : `Trendyol: ${res.status} ${res.error}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı",
    };
  }
}

function buildResult(
  items: TrendyolMenuItem[],
  storeIds: number[],
  source: "api" | "fallback",
  sections: TrendyolMenuSectionInfo[] = [],
  warning?: string,
): TrendyolMenuResult {
  const catMap = new Map<string, number>();
  let activeCount = 0;
  let outOfStockCount = 0;
  for (const item of items) {
    if (item.isActive) activeCount++;
    if (!item.inStock) outOfStockCount++;
    // Ürün birden fazla kategorideyse her birinde sayılır.
    const cats = item.categories?.length ? item.categories : ["Kategorisiz"];
    for (const cat of cats) catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
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
    sections: sections.sort((a, b) => a.name.localeCompare(b.name, "tr")),
    items: items.sort((a, b) => a.name.localeCompare(b.name, "tr")),
    error: warning,
  };
}
