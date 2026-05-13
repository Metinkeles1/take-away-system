// Sadece development — sahte Trendyol siparişi üretip kendi webhook'umuza yollar.
// Production'da 404 döner.

import { NextResponse } from "next/server";
import { generateMockTrendyolOrder } from "@/lib/integrations/trendyol/mock";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const apiKey = process.env.TRENDYOL_WEBHOOK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "TRENDYOL_WEBHOOK_API_KEY tanımlı değil — .env.local dosyasına ekleyin",
      },
      { status: 500 },
    );
  }

  const mock = generateMockTrendyolOrder();
  const origin = new URL(req.url).origin;

  const res = await fetch(`${origin}/api/webhooks/trendyol`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(mock),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json({ ok: res.ok, status: res.status, mock, response: data });
}
