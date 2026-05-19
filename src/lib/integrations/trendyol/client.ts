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
