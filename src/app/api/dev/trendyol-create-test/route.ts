// Dev only: Trendyol STAGE'inde gerçek bir test siparişi oluşturur.
// Trendyol bu çağrıya cevaben senin webhook URL'ine push eder, sipariş sistemde düşer.
//
// Kullanım:
//   POST /api/dev/trendyol-create-test
//   Body (opsiyonel): { "storeId": 12345, "productId": 67890, "productName": "Adana Kebap", "productPrice": 200 }
//
// Önkoşullar:
//   - .env.local TRENDYOL_API_BASE_URL=https://stageapi.tgoapis.com olmalı
//   - Çıkış IP'in Trendyol stage'de yetkilendirilmiş olmalı
//   - storeId / productId / productName değerleri için "Menülerin Alınması" servisinden gerçek değerleri alman lazım

import { NextResponse } from "next/server";
import { createTestMealOrder } from "@/lib/integrations/trendyol/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "dev only" }, { status: 404 });
  }

  let input: {
    storeId?: number;
    productId?: number;
    productName?: string;
    productPrice?: number;
    quantity?: number;
    deliveryType?: "STORE" | "GO";
  } = {};
  try {
    input = (await req.json()) as typeof input;
  } catch {
    // body yoksa default ile devam
  }

  if (!input.storeId || !input.productId || !input.productName) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "storeId, productId ve productName zorunlu. 'Menülerin Alınması' servisinden gerçek değerleri çek.",
      },
      { status: 400 },
    );
  }

  const result = await createTestMealOrder({
    storeId: input.storeId,
    productId: input.productId,
    productName: input.productName,
    productPrice: input.productPrice ?? 0,
    quantity: input.quantity ?? 1,
    deliveryType: input.deliveryType ?? "STORE",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : result.status || 500 });
}
