import { NextResponse } from "next/server";

import {
  getKomutaCustomers,
  getKomutaOperations,
  getKomutaOverview,
  getKomutaPeriodOrders,
} from "@/actions/komutaOverview";
import { getDashboardInsights } from "@/actions/dashboardInsights";
import { getCourierPerformance, getProductPerformance } from "@/actions/komutaPerformance";
import { getMonthlyTarget } from "@/actions/settings";
import { getTrendyolLoyalty } from "@/actions/trendyolArchive";
import { getTrendyolAccountOptions } from "@/actions/trendyolAccounts";
import { runWithTrendyolScope } from "@/lib/integrations/trendyol/scope";

// Komuta Merkezi okuma uç noktası. Server action'lar istemcide SIRAYLA çalışır
// (Next kuyruğu) — Genel Bakış'ın ~9 isteği birbirini bekliyor, sayfa geçişinde
// yeni sayfa eskisinin kuyruğunun arkasına düşüyordu. Düz GET istekleri tarayıcıda
// paralel gider. Yalnız aşağıdaki okuma fonksiyonları çağrılabilir.
const QUERIES = {
  overview: getKomutaOverview,
  insights: getDashboardInsights,
  target: getMonthlyTarget,
  operations: getKomutaOperations,
  periodOrders: getKomutaPeriodOrders,
  customers: getKomutaCustomers,
  productPerf: getProductPerformance,
  courierPerf: getCourierPerformance,
  tyLoyalty: getTrendyolLoyalty,
  tyAccounts: getTrendyolAccountOptions,
} as const;

export type KomutaQuery = keyof typeof QUERIES;

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ query: string }> }) {
  const { query } = await ctx.params;
  const fn = (QUERIES as Record<string, (...args: unknown[]) => Promise<unknown>>)[query];
  if (!fn) return NextResponse.json({ error: "Bilinmeyen sorgu" }, { status: 404 });

  let args: unknown[] = [];
  const search = new URL(req.url).searchParams;
  const raw = search.get("args");
  // ?isletme=<satıcı ID> → yalnız o Trendyol işletmesinin verisi (bkz. scope.ts).
  const isletme = search.get("isletme");
  if (isletme && !/^\d{1,20}$/.test(isletme)) {
    return NextResponse.json({ error: "Geçersiz işletme" }, { status: 400 });
  }
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length > 4) throw new Error();
      args = parsed;
    } catch {
      return NextResponse.json({ error: "Geçersiz parametre" }, { status: 400 });
    }
  }

  try {
    const data = await runWithTrendyolScope(isletme, () => fn(...args));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error(`[GET /api/komuta/${query}]`, err);
    return NextResponse.json({ error: "Veri alınamadı" }, { status: 500 });
  }
}
