import { NextResponse } from "next/server";
import { getCourierBoard } from "@/actions/courier";

// Kurye panosu okuması. Server action yerine GET: Next.js server action'ları
// istemcide SIRAYLA çalıştırır — arka plan yenilemesi sürerken kuryenin
// üstlen/bırak tıklaması onun bitmesini beklerdi. Okuma buradan gelince
// yazma action'ları kuyrukta beklemez.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCourierBoard());
  } catch (err) {
    console.error("[GET /api/courier/board]", err);
    return NextResponse.json({ error: "Pano alınamadı" }, { status: 500 });
  }
}
