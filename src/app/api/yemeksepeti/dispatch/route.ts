import { NextRequest, NextResponse } from "next/server";
import {
  claimDispatchJobs,
  recordDispatchResult,
  recordLearnedRequest,
} from "@/lib/yemeksepeti/dispatch";

// Otomatik "yola çıktı" — kasadaki eklenti ile konuşan uç.
//   GET  → gönderilecek işler (kiralanır; iki sekme aynı işi almaz)
//   POST { type: "result", orderId, attempts[], headerNames[] } → deneme sonucu
//   POST { type: "learned", url, method, requestBody, httpStatus, responseState }
//        → kasada elle basılan "yola çıktı"nın gerçek içeriği
// Erişim: ingest ile aynı anahtar (YEMEKSEPETI_INGEST_TOKEN).
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const token = process.env.YEMEKSEPETI_INGEST_TOKEN;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return !!token && provided === token;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  try {
    return NextResponse.json({ jobs: await claimDispatchJobs() });
  } catch (err) {
    console.error("[GET /api/yemeksepeti/dispatch]", err);
    return NextResponse.json({ jobs: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "geçersiz gövde" }, { status: 400 });
  }
  try {
    if (body.type === "learned") await recordLearnedRequest(body);
    else await recordDispatchResult(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/yemeksepeti/dispatch]", err);
    return NextResponse.json({ error: "kaydedilemedi" }, { status: 500 });
  }
}
