import { NextResponse } from "next/server";
import { autoSyncTrendyolCourierPackages } from "@/actions/trendyolCourier";

// Açık ekranların dakikalık "Trendyol çekme sırası geldi mi?" yoklaması.
// Server action yerine route: action'lar istemcide sırayla çalışır, Trendyol
// isteği sürerken kuryenin üstlen/teslim tıklaması beklemesin.
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await autoSyncTrendyolCourierPackages());
  } catch (err) {
    console.error("[POST /api/trendyol/auto-sync]", err);
    return NextResponse.json({ ran: false, ok: false }, { status: 500 });
  }
}
