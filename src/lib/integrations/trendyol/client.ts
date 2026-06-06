// Trendyol GO Yemek — outbound REST client.
//
// Resmi doküman: https://developers.tgoapps.com/docs/trendyol-go-yemek-entegrasyonu
//
// Base URL:
//   PROD : https://api.tgoapis.com
//   STAGE: https://stageapi.tgoapis.com
//
// Auth:
//   Authorization: Basic <base64(API_KEY:API_SECRET)>
//   User-Agent   : <SUPPLIER_ID> - SelfIntegration
//   x-agentname  : entegratör ismi (Trendyol'a tanıttığın firma adı)
//   x-executor-user: email (eylemi yapan kişi)
//
// Akış (Yemek):
//   1) Webhook ile sipariş gelir
//   2) PUT /integrator/order/meal/suppliers/{supplierId}/packages/picked       → "kabul ettim"
//   3) PUT /integrator/order/meal/suppliers/{supplierId}/packages/invoiced     → "hazırlığı bitirdim"
//   4) PUT /integrator/order/meal/suppliers/{supplierId}/packages/{packageId}/manual-shipped   → "yola çıktım"
//   5) PUT /integrator/order/meal/suppliers/{supplierId}/packages/{packageId}/manual-delivered → "teslim ettim"
//   İptal:
//      PUT /integrator/order/meal/suppliers/{supplierId}/packages/unsupplied

// HTTP header'ları ASCII (ByteString) olmak zorunda — Türkçe karakterleri çevir.
function toAsciiHeader(value: string): string {
  return value
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ç/g, "c").replace(/Ç/g, "C")
    .replace(/[^\x20-\x7E]/g, "?");
}

function readEnv() {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID;
  const baseUrl = process.env.TRENDYOL_API_BASE_URL ?? "https://api.tgoapis.com";
  const token =
    process.env.TRENDYOL_API_TOKEN ??
    (process.env.TRENDYOL_API_KEY && process.env.TRENDYOL_API_SECRET
      ? Buffer.from(
          `${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`,
        ).toString("base64")
      : undefined);
  const agentName = toAsciiHeader(process.env.TRENDYOL_AGENT_NAME ?? "PaketSiparis");
  const executorUser = process.env.TRENDYOL_EXECUTOR_USER ?? "system@local";

  if (!supplierId || !token) {
    throw new Error(
      "Trendyol env eksik: TRENDYOL_SUPPLIER_ID ve TRENDYOL_API_TOKEN (veya API_KEY+API_SECRET) gerekli.",
    );
  }
  return {
    supplierId,
    baseUrl: baseUrl.replace(/\/$/, ""),
    token,
    agentName,
    executorUser,
  };
}

export type TrendyolResponse<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

async function trendyolRequest<T = unknown>(init: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
}): Promise<TrendyolResponse<T>> {
  const { baseUrl, token, supplierId, agentName, executorUser } = readEnv();

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${init.path}`, {
      method: init.method,
      headers: {
        Authorization: `Basic ${token}`,
        "User-Agent": `${supplierId} - SelfIntegration`,
        "x-agentname": agentName,
        "x-executor-user": executorUser,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "network error",
    };
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: text || res.statusText };
  }
  try {
    return {
      ok: true,
      status: res.status,
      data: (text ? JSON.parse(text) : null) as T,
    };
  } catch {
    return { ok: true, status: res.status, data: text as unknown as T };
  }
}

function supplierPath(suffix: string) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  return `/integrator/order/meal/suppliers/${supplierId}${suffix}`;
}

// ─── 0) Paket listesi çek (polling) ─────────────────────────────────────
// Doküman: GET /integrator/order/meal/suppliers/{supplierId}/packages
// status filtresi: Created, Picking, Invoiced, Cancelled, UnSupplied, Shipped, Delivered
// Birden fazla: "Created,Picking"
export interface TrendyolPackageLineItem {
  packageItemId: string;
  lineItemId: number;
  isCancelled: boolean;
}
export interface TrendyolPackageLine {
  productId: number;
  name: string;
  price: number;
  unitSellingPrice: number;
  description?: string;
  items: TrendyolPackageLineItem[];
  modifierProducts?: Array<{ name: string; price: number; productId: number }>;
}
export interface TrendyolPackage {
  id: string;
  supplierId: number;
  storeId: number;
  orderId: string;
  orderNumber: string;
  packageCreationDate: number;
  packageModificationDate: number;
  preparationTime: number;
  totalPrice: number;
  callCenterPhone?: string;
  deliveryType: "STORE" | "GO";
  storePickupSelected?: boolean | null;
  customer?: { id?: number; firstName?: string; lastName?: string };
  address?: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    district?: string;
    neighborhood?: string;
    addressDescription?: string;
    phone?: string;
    latitude?: string;
    longitude?: string;
  };
  packageStatus:
    | "Created"
    | "Picking"
    | "Invoiced"
    | "Cancelled"
    | "UnSupplied"
    | "Shipped"
    | "Delivered";
  lines: TrendyolPackageLine[];
  payment?: {
    paymentType: "PAY_WITH_CARD" | "PAY_WITH_ON_DELIVERY" | "PAY_WITH_MEAL_CARD";
    mealCard?: { cardSourceType?: string } | null;
    onDelivery?: { paymentType?: string };
  };
  // Sepete uygulanan promosyonlar. totalSellerAmount = indirimin satıcı tarafından
  // karşılanan (hakedişten düşülen) kısmı — satışlar sayfasındaki "İndirim" kolonu.
  promotions?: Array<{
    promotionId?: number;
    description?: string;
    totalSellerAmount?: number;
  }>;
  coupon?: { totalSellerAmount?: number } | null;
  customerNote?: string;
}
export interface TrendyolPackagesResponse {
  page: number;
  size: number;
  totalPages: number;
  totalCount: number;
  content: TrendyolPackage[];
}

export function listTrendyolPackages(params: {
  storeId?: string | number;
  packageStatuses?: string;
  modificationStartDate?: number;
  modificationEndDate?: number;
  page?: number;
  size?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.storeId) qs.set("storeId", String(params.storeId));
  if (params.packageStatuses) qs.set("packageStatuses", params.packageStatuses);
  if (params.modificationStartDate)
    qs.set("packageModificationStartDate", String(params.modificationStartDate));
  if (params.modificationEndDate)
    qs.set("packageModificationEndDate", String(params.modificationEndDate));
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.size !== undefined) qs.set("size", String(params.size));
  const query = qs.toString();
  return trendyolRequest<TrendyolPackagesResponse>({
    method: "GET",
    path: supplierPath(`/packages${query ? `?${query}` : ""}`),
  });
}

// ─── Finansal kayıtlar (settlements) ───────────────────────────────────
// Doküman: GET /integrator/settlement/meal/sellers/{supplierId}/settlements
// Kısıtlar:
//   - transactionType zorunlu, tek istekte 1 type
//   - startDate/endDate zorunlu, arası max 15 gün
//   - size: 500 veya 1000 (default 500)
//
// İşaret tablosu (raporda toplanırken işaretlere dikkat — debt = borç, credit = alacak):
//   Sale                : credit(+) commissionAmount(-) sellerRevenue(+)
//   Return              : debt(-)  commissionAmount(+) sellerRevenue(-)
//   Discount            : debt(-)  commissionAmount(+) sellerRevenue(-)
//   DiscountCancel      : credit(+) commissionAmount(-) sellerRevenue(+)
//   Coupon              : credit(+) commissionAmount(-) sellerRevenue(-)
//   CouponCancel        : debt(-)  commissionAmount(+) sellerRevenue(+)
//   ManualRefund        : debt(-)  -                   sellerRevenue(-)
//   ManualRefundCancel  : credit(+) -                  sellerRevenue(+)

export type TrendyolSettlementTransactionType =
  | "Sale"
  | "Return"
  | "Discount"
  | "DiscountCancel"
  | "Coupon"
  | "CouponCancel"
  | "ProvisionPositive"
  | "ProvisionNegative"
  | "ManualRefund"
  | "ManualRefundCancel";

export interface TrendyolSettlement {
  id: string;
  transactionDate: number;
  barcode?: string | null;
  transactionType: string; // Türkçe label dönebilir (Satış, İade, ...)
  receiptId?: number | null;
  description?: string | null;
  debt: number;
  credit: number;
  paymentPeriod?: number | null;
  commissionRate?: number | null;
  commissionAmount?: number | null;
  commissionInvoiceSerialNumber?: string | null;
  sellerRevenue?: number | null;
  orderNumber?: string | null;
  paymentOrderId?: number | null;
  paymentDate?: number | null;
  sellerId?: number | null;
  storeId?: number | null;
  storeName?: string | null;
  storeAddress?: string | null;
  country?: string | null;
  orderDate?: number | null;
}

export interface TrendyolSettlementsResponse {
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  content: TrendyolSettlement[];
}

function sellerSettlementPath(suffix: string) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  return `/integrator/settlement/meal/sellers/${supplierId}${suffix}`;
}

export function listTrendyolSettlements(params: {
  transactionType: TrendyolSettlementTransactionType;
  startDate: number; // ms epoch
  endDate: number;   // ms epoch (max 15 gün aralık)
  page?: number;
  size?: 500 | 1000;
}) {
  const qs = new URLSearchParams();
  qs.set("transactionType", params.transactionType);
  qs.set("startDate", String(params.startDate));
  qs.set("endDate", String(params.endDate));
  qs.set("page", String(params.page ?? 0));
  qs.set("size", String(params.size ?? 500));
  return trendyolRequest<TrendyolSettlementsResponse>({
    method: "GET",
    path: sellerSettlementPath(`/settlements?${qs.toString()}`),
  });
}

// ─── Menü / Ürün listesi ───────────────────────────────────────────────
// Doküman: GET /integrator/product/meal/suppliers/{supplierId}/stores/{storeId}/products
// storeId ZORUNLU. Response { products, sections, ingredients, modifierGroups }.
// sections[].products[] üzerinden ürün → kategori eşlemesi yapılır.
// NOT: Trendyol Menu API response'unda field isimleri tutarsız;
// price nested object olabilir (price.sellingPrice gibi), name bazen variant
// adı oluyor. Bilinmeyen alanlar için index signature açık.
export interface TrendyolMenuProduct {
  id: number;
  name: string;
  description?: string | null;
  originalPrice?: number;
  sellingPrice?: number;
  status?: "ACTIVE" | "INACTIVE" | string;
  ingredients?: number[];
  extraIngredients?: number[];
  modifierGroups?: Array<{ id: number; position?: number }>;
  productGroup?: { id?: number; name?: string };
  productName?: string;
  price?: unknown;
}

export interface TrendyolMenuSection {
  id: number;
  name: string;
  position?: number;
  status?: "ACTIVE" | "INACTIVE" | string;
  products?: Array<{ id: number; position?: number }>;
}

export interface TrendyolMenuIngredient {
  id: number;
  name: string;
  price?: number;
  status?: "ACTIVE" | "INACTIVE" | string;
}

export interface TrendyolMenuModifierGroup {
  id: number;
  name: string;
  min?: number;
  max?: number;
  modifierProducts?: Array<{ id: number; price?: number; position?: number }>;
}

export interface TrendyolMenuResponse {
  products: TrendyolMenuProduct[];
  sections?: TrendyolMenuSection[];
  ingredients?: TrendyolMenuIngredient[];
  modifierGroups?: TrendyolMenuModifierGroup[];
}

export function listTrendyolMenuProducts(params: {
  storeId: string | number;
}) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  return trendyolRequest<TrendyolMenuResponse>({
    method: "GET",
    path: `/integrator/product/meal/suppliers/${supplierId}/stores/${params.storeId}/products`,
  });
}

// ─── Ürün fiyat güncelleme ─────────────────────────────────────────────
// Doküman: POST /integrator/product/meal/suppliers/{supplierId}/products/price
// Kuyruğa alınır → { batchRequestId } döner. Sonuç getTrendyolBatchRequestResult ile.
// Kurallar:
//  - restaurantId opsiyonel; verilmezse fiyat TÜM restoranlara uygulanır.
//  - aynı talepte max 1000 item.
//  - AYNI body ile tekrar gönderilirse "tekrarlı fiyat güncelleme" hatası → sadece
//    değişen fiyatları gönder.
//  - originalPrice Trendyol tarafında hesaplanır; sadece sellingPrice gönderilir.
export interface TrendyolPriceUpdateItem {
  productId: number;
  sellingPrice: number;
  restaurantId?: number;
}

export interface TrendyolBatchRequestRef {
  batchRequestId: string;
}

export function updateTrendyolMealPrices(items: TrendyolPriceUpdateItem[]) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  return trendyolRequest<TrendyolBatchRequestRef>({
    method: "POST",
    path: `/integrator/product/meal/suppliers/${supplierId}/products/price`,
    body: { items },
  });
}

// ─── Toplu işlem sonucu (batch request result) ─────────────────────────
// Doküman: GET /integrator/product/meal/suppliers/{supplierId}/batch-requests/{batchRequestId}
// updatePrice kuyruğa atıldığı için sonucu bununla poll ederiz. 4 saat erişilebilir.
export interface TrendyolBatchResultItem {
  requestItem?: {
    request?: TrendyolPriceUpdateItem;
    productId?: number;
    restaurantId?: number;
  };
  status?: "SUCCESS" | "FAILED" | string;
  failureReasons?: string[];
}

export interface TrendyolBatchRequestResult {
  supplierId?: number;
  batchRequestId: string;
  items?: TrendyolBatchResultItem[];
  status?: "COMPLETED" | "PROCESSING" | string;
  creationDate?: number;
  lastModification?: number;
  sourceType?: string;
  itemCount?: number;
  failedItemCount?: number;
  batchRequestType?: string;
}

export function getTrendyolBatchRequestResult(batchRequestId: string) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  return trendyolRequest<TrendyolBatchRequestResult>({
    method: "GET",
    path: `/integrator/product/meal/suppliers/${supplierId}/batch-requests/${batchRequestId}`,
  });
}

// ─── Ürün satışa aç/kapa ───────────────────────────────────────────────
// Doküman: PUT /integrator/product/meal/suppliers/{supplierId}/stores/{storeId}/products/{productId}/status
// body { status: "ACTIVE" | "PASSIVE" }. Senkron (200). 409 = eşzamanlı değişiklik, tekrar dene.
export function updateTrendyolProductStatus(params: {
  storeId: string | number;
  productId: string | number;
  status: "ACTIVE" | "PASSIVE";
}) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  return trendyolRequest({
    method: "PUT",
    path: `/integrator/product/meal/suppliers/${supplierId}/stores/${params.storeId}/products/${params.productId}/status`,
    body: { status: params.status },
  });
}

// ─── Kategori (section) satışa aç/kapa ──────────────────────────────────
// Doküman: PUT /integrator/product/meal/suppliers/{supplierId}/stores/{storeId}/sections/{sectionId}/status
export function updateTrendyolSectionStatus(params: {
  storeId: string | number;
  sectionId: string | number;
  status: "ACTIVE" | "PASSIVE";
}) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  return trendyolRequest({
    method: "PUT",
    path: `/integrator/product/meal/suppliers/${supplierId}/stores/${params.storeId}/sections/${params.sectionId}/status`,
    body: { status: params.status },
  });
}

// ─── 1) Siparişi kabul et (picked) ──────────────────────────────────────
// preparationTime: dakika cinsinden hazırlık tahmini
export function acceptTrendyolPackage(packageId: string, preparationTime = 20) {
  return trendyolRequest({
    method: "PUT",
    path: supplierPath("/packages/picked"),
    body: { packageId, preparationTime },
  });
}

// ─── 2) Hazırlık bitti (invoiced) ───────────────────────────────────────
export function markTrendyolPackageInvoiced(packageId: string) {
  return trendyolRequest({
    method: "PUT",
    path: supplierPath("/packages/invoiced"),
    body: { packageId, actualDate: Date.now() },
  });
}

// ─── 3) Yola çıktı (manual-shipped) — sadece kendi kuryesi olanlar ─────
export function shipTrendyolPackage(packageId: string) {
  return trendyolRequest({
    method: "PUT",
    path: supplierPath(`/packages/${packageId}/manual-shipped`),
    body: { actualDate: Date.now() },
  });
}

// ─── 4) Teslim edildi (manual-delivered) ────────────────────────────────
export function deliverTrendyolPackage(packageId: string) {
  return trendyolRequest({
    method: "PUT",
    path: supplierPath(`/packages/${packageId}/manual-delivered`),
    body: { actualDate: Date.now() },
  });
}

// ─── 5) İptal (unsupplied) ──────────────────────────────────────────────
// Full iptal: itemIdList'e paketin tüm packageItemId'leri verilir.
// reasonId 621 = restoran kaynaklı genel iptal (Paket Modelleri sayfasından).
// İlk versiyon: itemId bilinmiyorsa boş liste — daha sonra paket detayından doldurulur.
export function cancelTrendyolPackage(
  packageId: string,
  options: { itemIdList?: string[]; reasonId?: number } = {},
) {
  return trendyolRequest({
    method: "PUT",
    path: supplierPath("/packages/unsupplied"),
    body: {
      packageId,
      itemIdList: options.itemIdList ?? [],
      reasonId: options.reasonId ?? 621,
    },
  });
}

// ─── Test ortamı: sipariş oluştur ───────────────────────────────────────
// Sadece STAGE'de çalışır. Trendyol bu çağrıyla bir test siparişi üretir ve
// senin webhook URL'ine push eder.
export interface CreateTestMealOrderInput {
  storeId: number;
  supplierId?: number; // env'den çekilebilir
  deliveryType?: "STORE" | "GO";
  productId: number;
  productName: string;
  productPrice: number;
  quantity?: number;
  customer?: { firstName?: string; lastName?: string; note?: string };
  address?: {
    addressText?: string;
    city?: string;
    district?: string;
    neighborhood?: string;
    latitude?: number;
    longitude?: number;
    phone?: string;
    email?: string;
  };
  payment?: {
    isPaidWithMealCard?: boolean;
    mealCardType?: string;
    isCashOnDeliveryPaid?: boolean;
    onDeliveryPaymentType?: "CASH" | "CARD";
  };
}

export function createTestMealOrder(input: CreateTestMealOrderInput) {
  const supplierId = input.supplierId ?? Number(process.env.TRENDYOL_SUPPLIER_ID);
  const body = {
    address: {
      addressText: input.address?.addressText ?? "Test Adres No: 1",
      city: input.address?.city ?? "İstanbul",
      district: input.address?.district ?? "Kadıköy",
      neighborhood: input.address?.neighborhood ?? "Caferağa",
      latitude: input.address?.latitude ?? 40.8796,
      longitude: input.address?.longitude ?? 29.258,
      phone: input.address?.phone ?? "5351231231",
      email: input.address?.email ?? "test@local",
    },
    isStorePickupSelected: false,
    customer: {
      customerFirstName: input.customer?.firstName ?? "Test",
      customerLastName: input.customer?.lastName ?? "Müşteri",
      note: input.customer?.note ?? "Test sipariş",
    },
    lines: [
      {
        ingredientOptions: { exclude: [], include: [] },
        modifierProducts: [],
        product: { productId: input.productId, productName: input.productName },
        quantity: input.quantity ?? 1,
      },
    ],
    store: {
      deliveryType: input.deliveryType ?? "STORE",
      storeId: input.storeId,
      supplierId,
    },
    coupon: null,
    promotions: [],
    payment: {
      isPaidWithMealCard: input.payment?.isPaidWithMealCard ?? false,
      mealCardType: input.payment?.mealCardType ?? "",
      isCashOnDeliveryPaid: input.payment?.isCashOnDeliveryPaid ?? true,
      onDeliveryPaymentType: input.payment?.onDeliveryPaymentType ?? "CASH",
    },
  };

  return trendyolRequest<{ orderNumber?: string }>({
    method: "POST",
    path: "/integrator/meal-test-order/orders/meal",
    body,
  });
}

// ─── Reviews — Stats ────────────────────────────────────────────────────
// GET /integrator/review/meal/suppliers/{supplierId}/stores/{storeId}/reviews/stats
// 404 + "Değerlendirme sayısı 3dan az." → yeterli veri yok demek; trendyolRequest
// bu durumda { ok:false, status:404, error:"..." } döner, caller decide eder.
export interface TrendyolReviewStats {
  averageScores: {
    overall: number;
    flavor: number;
    service: number;
    delivery: number;
  };
  commentCount: number;
  ratingCount: number;
}

export function listTrendyolReviewStats(params: { storeId: string | number }) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  return trendyolRequest<TrendyolReviewStats>({
    method: "GET",
    path: `/integrator/review/meal/suppliers/${supplierId}/stores/${params.storeId}/reviews/stats`,
  });
}

// ─── Reviews — Filter (list) ────────────────────────────────────────────
// GET /integrator/review/meal/suppliers/{supplierId}/stores/{storeId}/reviews/filter
export type TrendyolReviewAnswerStatus =
  | "WAITING_FOR_APPROVE"
  | "APPROVED"
  | "REJECTED";

export interface TrendyolReviewProduct {
  productId: string;
  name: string;
  modifierProducts?: Array<{ productId: string; name: string }>;
}

export interface TrendyolReviewRejectedReason {
  reason: string;
  reasonId: number;
}

export interface TrendyolReviewRestaurantAnswer {
  text: string;
  status: TrendyolReviewAnswerStatus;
  rejectedReason?: TrendyolReviewRejectedReason;
}

export interface TrendyolReviewComment {
  text?: string;
  restaurantAnswer?: TrendyolReviewRestaurantAnswer;
}

export interface TrendyolReview {
  reviewId: string;
  restaurantId: number;
  orderCreatedDate: number;
  createdDate: number;
  orderParentId: number;
  rating: {
    flavorScore: number;
    serviceScore: number;
    deliveryScore: number;
    average: number;
  };
  deliveryType: "STORE" | "GO";
  products?: TrendyolReviewProduct[];
  comment?: TrendyolReviewComment;
}

export interface TrendyolReviewsResponse {
  page?: number;
  size?: number;
  totalPages?: number;
  totalElements?: number;
  totalCount?: number;
  content?: TrendyolReview[];
}

export function listTrendyolReviews(params: {
  storeId: string | number;
  page?: number;
  size?: number;
  deliveryType?: "STORE" | "GO";
  startDate?: number;
  endDate?: number;
  orderParentId?: number;
  hasComment?: boolean;
  hasRestaurantAnswer?: boolean;
  restaurantAnswerStatus?: TrendyolReviewAnswerStatus;
}) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.size !== undefined) qs.set("size", String(params.size));
  if (params.deliveryType) qs.set("deliveryType", params.deliveryType);
  if (params.startDate !== undefined) qs.set("startDate", String(params.startDate));
  if (params.endDate !== undefined) qs.set("endDate", String(params.endDate));
  if (params.orderParentId !== undefined) qs.set("orderParentId", String(params.orderParentId));
  if (params.hasComment !== undefined) qs.set("hasComment", String(params.hasComment));
  if (params.hasRestaurantAnswer !== undefined)
    qs.set("hasRestaurantAnswer", String(params.hasRestaurantAnswer));
  if (params.restaurantAnswerStatus)
    qs.set("restaurantAnswerStatus", params.restaurantAnswerStatus);

  const query = qs.toString();
  return trendyolRequest<TrendyolReviewsResponse>({
    method: "GET",
    path: `/integrator/review/meal/suppliers/${supplierId}/stores/${params.storeId}/reviews/filter${query ? `?${query}` : ""}`,
  });
}

// ─── Promosyonlar (Kampanyalar) ─────────────────────────────────────────
// Doküman: .../integrator/promotion/suppliers/{supplierId}/promotions
// NOT: Bu endpoint "order/meal" değil, ayrı "promotion" alan adı altında.
// channel: bu panel için MEAL (Yemek). Koşullarda sectionIds = menü kategorileri.
// İndirimin tipi award.type ile belirlenir:
//   AMOUNT      → sabit TL indirim
//   PERCENTAGE  → yüzde indirim (value=100 → bedava)
//   FIXED_PRICE → ürünü sabit fiyata sat
// Tier (kademeli) = birden fazla award. Kod promosyonu = code alanı dolu.
// Hediye/ödül ürün = award.condition.contentIds + award.visible=true.

export type TrendyolPromotionStatus =
  | "CREATED"
  | "ATTENDANCE"
  | "READY"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELED";

export type TrendyolPromotionChannel = "MEAL" | "GROCERY";

export type TrendyolAwardType = "AMOUNT" | "PERCENTAGE" | "FIXED_PRICE";

export interface TrendyolPromotionTerm {
  isBold: boolean;
  term: string;
}

export interface TrendyolPromotionDate {
  start: string; // ISO 8601 (örn. 2026-01-16T19:33:22.997Z)
  end: string;
}

export interface TrendyolPromotionConditionSet {
  brandIds?: number[];
  categoryIds?: number[];
  contentIds?: number[];
  contentIdsMeta?: Array<{ secondaryId: string }>;
  storeIds?: number[];
  sellerIds?: number[];
  userSegments?: string[];
  sectionIds?: number[]; // sadece MEAL
  specialSectionIds?: number[]; // sadece MEAL
}

export interface TrendyolPromotionConditions {
  include?: TrendyolPromotionConditionSet;
  exclude?: TrendyolPromotionConditionSet;
}

export interface TrendyolAwardCondition {
  minProductQuantity?: number;
  minBasketAmount?: number;
  brandIds?: number[];
  categoryIds?: number[];
  contentIds?: number[];
  storeIds?: number[];
  sellerIds?: number[];
  userSegments?: string[];
  sectionIds?: number[];
  specialSectionIds?: number[];
}

export interface TrendyolPromotionAward {
  id?: string;
  type: TrendyolAwardType;
  value: number;
  quantity?: number;
  visible?: boolean;
  condition: TrendyolAwardCondition;
}

export interface TrendyolPromotionUsage {
  perUserLimit?: number;
  current?: number;
  maxLimit?: number;
  exceeded?: boolean;
  applyPerBasketLimit?: number;
}

export interface TrendyolPromotionDiscount {
  perUserLimit?: number;
  perOrderLimit?: number;
}

export interface TrendyolPromotion {
  id: string;
  name: string;
  shortname?: string;
  code?: string;
  description?: string;
  tagId?: number;
  apps: string[];
  tags?: string[];
  terms?: TrendyolPromotionTerm[];
  date: TrendyolPromotionDate;
  channel: string;
  conditions?: TrendyolPromotionConditions;
  awards: TrendyolPromotionAward[];
  usage?: TrendyolPromotionUsage;
  discount?: TrendyolPromotionDiscount;
  status: TrendyolPromotionStatus | string;
  createdDate?: string;
}

export interface TrendyolPromotionsResponse {
  items: TrendyolPromotion[];
  links?: {
    page?: number;
    perPage?: number;
    pageCount?: number;
    totalCount?: number;
  };
}

// POST body (oluşturma). idempotencyKey zorunlu.
export interface CreateTrendyolPromotionBody {
  idempotencyKey: string;
  name: string;
  shortname?: string;
  code?: string;
  description?: string;
  tagId?: number;
  tags?: string[];
  apps: string[];
  terms: TrendyolPromotionTerm[];
  date: TrendyolPromotionDate;
  channel: string;
  conditions: TrendyolPromotionConditions;
  awards: TrendyolPromotionAward[];
  usage?: TrendyolPromotionUsage;
  discount?: TrendyolPromotionDiscount;
}

// PUT body (güncelleme). idempotencyKey yok; gerisi aynı.
export type UpdateTrendyolPromotionBody = Omit<
  CreateTrendyolPromotionBody,
  "idempotencyKey"
>;

function promotionPath(suffix: string) {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID!;
  return `/integrator/promotion/suppliers/${supplierId}/promotions${suffix}`;
}

// Listele. channel zorunlu. status/storeId/page/size opsiyonel.
export function listTrendyolPromotions(params: {
  channel?: TrendyolPromotionChannel | string;
  status?: TrendyolPromotionStatus | string;
  storeId?: string | number;
  page?: number;
  size?: number;
}) {
  const qs = new URLSearchParams();
  qs.set("channel", params.channel ?? "GROCERY");
  if (params.status) qs.set("status", params.status);
  if (params.storeId) qs.set("storeId", String(params.storeId));
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.size !== undefined) qs.set("size", String(params.size));
  return trendyolRequest<TrendyolPromotionsResponse>({
    method: "GET",
    path: promotionPath(`?${qs.toString()}`),
  });
}

// Tek kampanya detayı.
export function getTrendyolPromotion(promotionId: string | number) {
  return trendyolRequest<TrendyolPromotion>({
    method: "GET",
    path: promotionPath(`/${promotionId}`),
  });
}

// Oluştur → 201 { id }.
export function createTrendyolPromotion(body: CreateTrendyolPromotionBody) {
  return trendyolRequest<{ id: string }>({
    method: "POST",
    path: promotionPath(""),
    body,
  });
}

// Güncelle → 204 (gövdesiz).
export function updateTrendyolPromotion(
  promotionId: string | number,
  body: UpdateTrendyolPromotionBody,
) {
  return trendyolRequest({
    method: "PUT",
    path: promotionPath(`/${promotionId}`),
    body,
  });
}

// İptal → 204. updatedBy opsiyonel (kimin iptal ettiği).
export function cancelTrendyolPromotion(
  promotionId: string | number,
  updatedBy?: string,
) {
  const qs = updatedBy
    ? `?updatedBy=${encodeURIComponent(updatedBy)}`
    : "";
  return trendyolRequest({
    method: "DELETE",
    path: promotionPath(`/${promotionId}${qs}`),
  });
}
