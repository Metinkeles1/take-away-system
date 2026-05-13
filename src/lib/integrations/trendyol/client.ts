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
  const agentName = process.env.TRENDYOL_AGENT_NAME ?? "PaketSipariş";
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
