import { NextResponse } from "next/server";
import { getPanelSummary } from "@/actions/panel";

// Panel özeti okuması. Server action yerine GET: Next.js server action'ları
// istemcide SIRAYLA çalıştırır — özet sürerken kurye atama gibi tıklamalar
// ve kuryedeki para okuması onun bitmesini beklerdi (bkz. /api/courier/board).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPanelSummary());
  } catch (err) {
    console.error("[GET /api/panel/summary]", err);
    return NextResponse.json({ error: "Özet alınamadı" }, { status: 500 });
  }
}
