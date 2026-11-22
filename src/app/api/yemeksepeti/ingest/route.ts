import { NextRequest, NextResponse } from "next/server";
import { ingestCaptures, type YsCapture } from "@/lib/yemeksepeti/ingest";

// Yemeksepeti tarayıcı eklentisinin (extensions/yemeksepeti) veri gönderdiği uç.
// Erişim: YEMEKSEPETI_INGEST_TOKEN — eklenti ayarlarına girilen anahtar.
//   POST /api/yemeksepeti/ingest   Header: "Authorization: Bearer <token>"
//   Gövde: { captures: YsCapture[] }
// Eklenti isteği arka plan betiğinden atar (sayfa bağlamı değil) → CORS gerekmez.
export const dynamic = "force-dynamic";

const MAX_CAPTURES = 50;

export async function POST(req: NextRequest) {
  const token = process.env.YEMEKSEPETI_INGEST_TOKEN;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || provided !== token) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  let captures: YsCapture[];
  try {
    const json = await req.json();
    captures = Array.isArray(json?.captures) ? json.captures : [];
  } catch {
    return NextResponse.json({ error: "geçersiz gövde" }, { status: 400 });
  }
  if (!captures.length) return NextResponse.json({ orders: 0, raw: 0, ignored: 0 });

  try {
    const result = await ingestCaptures(captures.slice(0, MAX_CAPTURES));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/yemeksepeti/ingest]", err);
    return NextResponse.json({ error: "kaydedilemedi" }, { status: 500 });
  }
}
