"use server";

// Trendyol GO Yemek menüsü: canlı liste, fiyat güncelleme, satışa aç/kapa.
// Endpoint: GET /integrator/product/meal/suppliers/{supplierId}/stores/{storeId}/products
// storeId zorunlu — env'den (TRENDYOL_STORE_ID) ya da son paketlerden otomatik bulunur.
// Birden fazla mağaza varsa hepsi paralel çekilir ve birleştirilir.

import {
  listTrendyolMenuProducts,
  listTrendyolPackages,
  updateTrendyolMealPrices,
  getTrendyolBatchRequestResult,
  updateTrendyolProductStatus,
  updateTrendyolSectionStatus,
  type TrendyolMenuProduct,
  type TrendyolPriceUpdateItem,
} from "@/lib/integrations/trendyol/client";
import { resolveTrendyolStoreIds } from "@/lib/integrations/trendyol/stores";
import {
  accountForStore,
  type TrendyolCreds,
} from "@/lib/integrations/trendyol/accounts";

export interface TrendyolMenuItem {
  productId: number;
  storeId: number;
  name: string;
  description?: string;
  price: number;
  originalPrice?: number;
  isActive: boolean;
  sectionIds: number[]; // ait olduğu gerçek kategoriler (vitrin hariç)
  ingredients?: string[]; // çözümlenmiş malzeme adları
  modifiers?: string[]; // çözümlenmiş opsiyon grup adları (ör. "İçecek Seçimi")
}

export interface TrendyolMenuSectionInfo {
  id: number;
  name: string;
  active: boolean;
  storeId: number;
  position: number;
  curated: boolean; // Trendyol'un otomatik vitrin kategorisi (ör. "En Sevilenler")
  productIds: number[]; // kategori içi sırasıyla
}

export interface TrendyolMenuResult {
  fetchedAt: string;
  source: "api" | "fallback";
  storeIds: number[];
  sections: TrendyolMenuSectionInfo[]; // menü sırasıyla
  items: TrendyolMenuItem[];
  error?: string;
}

// Trendyol'un otomatik vitrin/kürasyon kategorileri — gerçek menü kategorisi değil,
// ürünleri tekrarlar. Ayrı tutulur. Yeni ad çıkarsa ekle.
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

function isActiveStatus(status: string | undefined): boolean {
  return (status ?? "ACTIVE").toUpperCase() === "ACTIVE";
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

// NOT: Trendyol GO Yemek menü API'si ürün GÖRSELİ ve stok bilgisi döndürmüyor.

function normalize(
  p: TrendyolMenuProduct,
  storeId: number,
  sectionIds: number[],
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
    originalPrice: selling > 0 && original > selling ? original : undefined,
    isActive: isActiveStatus(p.status),
    sectionIds,
    ingredients: ingredients.length ? ingredients : undefined,
    modifiers: modifiers.length ? modifiers : undefined,
  };
}


export async function getTrendyolMenu(): Promise<TrendyolMenuResult> {
  const storeIds = await resolveTrendyolStoreIds();

  if (storeIds.length === 0) {
    return await fallbackFromPackages(
      "Mağaza ID'si bulunamadı. Ayarlar > Trendyol Hesapları'ndan mağaza ID'si girin ya da en az 1 sipariş geçmişi gerekli.",
    );
  }

  try {
    const responses = await Promise.all(
      storeIds.map((storeId) =>
        listTrendyolMenuProducts({ storeId }).then((res) => ({ storeId, res })),
      ),
    );

    // productId bazında tekilleştir: aynı ürün birden fazla mağazada dönebilir.
    const byId = new Map<number, TrendyolMenuItem>();
    const sectionById = new Map<number, TrendyolMenuSectionInfo>();
    const errors: string[] = [];

    for (const { storeId, res } of responses) {
      if (!res.ok) {
        errors.push(`Mağaza ${storeId}: ${res.status} ${res.error}`);
        continue;
      }
      const data = res.data;

      // Kategoriler Trendyol'daki sırasıyla; ürünler de kategori içi sırasıyla.
      const sections = [...(data.sections ?? [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
      );
      const productSections = new Map<number, number[]>();
      for (const s of sections) {
        const curated = isCuratedSection(s.name);
        const productIds = [...(s.products ?? [])]
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((r) => r.id);
        if (!sectionById.has(s.id)) {
          sectionById.set(s.id, {
            id: s.id,
            name: s.name,
            active: isActiveStatus(s.status),
            storeId,
            position: s.position ?? sectionById.size,
            curated,
            productIds,
          });
        }
        if (curated) continue;
        for (const pid of productIds) {
          const arr = productSections.get(pid) ?? [];
          if (!arr.includes(s.id)) arr.push(s.id);
          productSections.set(pid, arr);
        }
      }

      // Malzeme/opsiyon id → ad çözümlemesi.
      const ingredientMap = new Map<number, string>();
      for (const ing of data.ingredients ?? []) ingredientMap.set(ing.id, ing.name);
      const modifierMap = new Map<number, string>();
      for (const mg of data.modifierGroups ?? []) modifierMap.set(mg.id, mg.name);

      for (const p of data.products ?? []) {
        const item = normalize(
          p,
          storeId,
          productSections.get(p.id) ?? [],
          ingredientMap,
          modifierMap,
        );
        const existing = byId.get(item.productId);
        if (!existing) byId.set(item.productId, item);
        else
          existing.sectionIds = [
            ...new Set([...existing.sectionIds, ...item.sectionIds]),
          ];
      }
    }

    const items = [...byId.values()];

    if (items.length === 0) {
      return await fallbackFromPackages(
        errors.length > 0
          ? `Menü API hatası: ${errors.join("; ")}`
          : "Menü API boş döndü",
      );
    }

    return {
      fetchedAt: new Date().toISOString(),
      source: "api",
      storeIds,
      sections: [...sectionById.values()].sort((a, b) => a.position - b.position),
      items: items.sort((a, b) => a.name.localeCompare(b.name, "tr")),
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  } catch (err) {
    return await fallbackFromPackages(
      err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı",
    );
  }
}

// Fallback: menü API'si çalışmazsa son 30 günün paketlerinden ürünleri çıkar
// (salt okunur; fiyat ve durum yaklaşık).
async function fallbackFromPackages(reason: string): Promise<TrendyolMenuResult> {
  const empty: TrendyolMenuResult = {
    fetchedAt: new Date().toISOString(),
    source: "fallback",
    storeIds: [],
    sections: [],
    items: [],
    error: reason,
  };
  try {
    const end = Date.now();
    const start = end - 30 * 24 * 60 * 60 * 1000;
    const map = new Map<number, TrendyolMenuItem>();
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
          if (map.has(line.productId)) continue;
          map.set(line.productId, {
            productId: line.productId,
            storeId: pkg.storeId ?? 0,
            name: line.name,
            description: line.description ?? undefined,
            price: line.unitSellingPrice ?? line.price ?? 0,
            isActive: true,
            sectionIds: [],
          });
        }
      }
      if (page + 1 >= (res.data.totalPages ?? 1)) break;
      page++;
    }
    return {
      ...empty,
      storeIds: [...storeIds],
      items: [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "tr")),
    };
  } catch {
    return empty;
  }
}

// ─── Fiyat güncelleme ──────────────────────────────────────────────────
// Sadece DEĞİŞEN fiyatlar gönderilmeli (Trendyol aynı body'yi tekrarlarsa
// "tekrarlı fiyat güncelleme" hatası verir). restaurantId göndermiyoruz →
// fiyat o hesabın tüm restoranlarına uygulanır. Çoklu işletmede ürünler
// mağazalarına göre hesaplara bölünüp ayrı ayrı gönderilir.
// Trendyol kuyruğa alır; sonucu sunucuda bekleyip tek seferde döneriz.

export interface PriceUpdateInput {
  productId: number;
  sellingPrice: number;
  // Ürünün mağazası — çoklu işletmede fiyat doğru hesaba gitsin diye. Yoksa
  // varsayılan hesap kullanılır.
  storeId?: number;
}

export interface PriceUpdateResult {
  ok: boolean;
  pending?: boolean; // Trendyol süre içinde işlemeyi bitirmedi
  succeeded: number[]; // başarılı productId'ler
  failed: { productId: number; reason: string }[];
  error?: string;
}

// Tek hesaba fiyat gönder + kuyruk sonucunu bekle.
async function pushPrices(
  payload: TrendyolPriceUpdateItem[],
  account: TrendyolCreds | undefined,
): Promise<PriceUpdateResult> {
  const fail = (error: string): PriceUpdateResult => ({
    ok: false,
    succeeded: [],
    failed: [],
    error,
  });
  const prefix = account ? `${account.name}: ` : "";
  const res = await updateTrendyolMealPrices(payload, account);
  if (!res.ok) return fail(`${prefix}Trendyol: ${res.status} ${res.error}`);
  const batchRequestId = res.data?.batchRequestId;
  if (!batchRequestId) return fail(`${prefix}Trendyol işlem numarası döndürmedi.`);

  // Kuyruk genelde birkaç saniyede işlenir; en fazla ~20 sn bekle.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await getTrendyolBatchRequestResult(batchRequestId, account);
    if (!r.ok || (r.data?.status ?? "").toUpperCase() !== "COMPLETED") continue;

    const succeeded: number[] = [];
    const failed: { productId: number; reason: string }[] = [];
    for (const it of r.data.items ?? []) {
      const productId =
        it.requestItem?.productId ?? it.requestItem?.request?.productId;
      if (!productId) continue;
      if ((it.status ?? "").toUpperCase() === "SUCCESS") succeeded.push(productId);
      else
        failed.push({
          productId,
          reason: it.failureReasons?.[0] ?? "Bilinmeyen hata",
        });
    }
    // Kalem detayı yoksa ve hata sayısı 0 ise hepsini başarılı say.
    if (succeeded.length + failed.length === 0 && !r.data.failedItemCount) {
      succeeded.push(...payload.map((p) => p.productId));
    }
    return { ok: true, succeeded, failed };
  }
  return { ok: true, pending: true, succeeded: [], failed: [] };
}

export async function updateTrendyolPrices(
  items: PriceUpdateInput[],
): Promise<PriceUpdateResult> {
  // Aynı ürün birden fazla kez geldiyse sonuncuyu al (duplicate productId'yi önle).
  const byId = new Map<number, { sellingPrice: number; storeId?: number }>();
  for (const it of items) {
    if (!Number.isFinite(it.productId) || it.productId <= 0) continue;
    if (!Number.isFinite(it.sellingPrice) || it.sellingPrice <= 0) continue;
    byId.set(it.productId, {
      sellingPrice: Math.round(it.sellingPrice * 100) / 100,
      storeId: it.storeId,
    });
  }
  const fail = (error: string): PriceUpdateResult => ({
    ok: false,
    succeeded: [],
    failed: [],
    error,
  });

  if (byId.size === 0) return fail("Geçerli fiyat değişikliği yok.");
  if (byId.size > 1000) return fail("Tek seferde en fazla 1000 ürün güncellenebilir.");

  try {
    // Ürünleri hesaplarına göre grupla (mağaza → hesap). Bilinmeyen → varsayılan.
    const groups = new Map<string, { account?: TrendyolCreds; payload: TrendyolPriceUpdateItem[] }>();
    for (const [productId, { sellingPrice, storeId }] of byId) {
      const account = storeId ? (await accountForStore(storeId)) ?? undefined : undefined;
      const key = account?.id ?? "default";
      const g = groups.get(key) ?? { account, payload: [] };
      g.payload.push({ productId, sellingPrice });
      groups.set(key, g);
    }

    const results = await Promise.all(
      [...groups.values()].map((g) => pushPrices(g.payload, g.account)),
    );
    const errors = results.filter((r) => !r.ok).map((r) => r.error);
    const oks = results.filter((r) => r.ok);
    if (oks.length === 0) return fail(errors.join(" · "));
    return {
      ok: true,
      pending: oks.some((r) => r.pending) || undefined,
      succeeded: oks.flatMap((r) => r.succeeded),
      failed: oks.flatMap((r) => r.failed),
      error: errors.length ? errors.join(" · ") : undefined,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı");
  }
}

// ─── Ürün / kategori satışa aç-kapa ────────────────────────────────────
// Senkron (200). 409 = eşzamanlı değişiklik → tekrar denenmeli.
function statusError(res: { status: number; error: string }): string {
  return res.status === 409
    ? "Eşzamanlı değişiklik oldu, tekrar deneyin."
    : `Trendyol: ${res.status} ${res.error}`;
}

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
    return res.ok ? { ok: true } : { ok: false, error: statusError(res) };
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
    return res.ok ? { ok: true } : { ok: false, error: statusError(res) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Trendyol API'sına ulaşılamadı",
    };
  }
}
