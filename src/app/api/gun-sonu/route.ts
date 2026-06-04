import { NextRequest, NextResponse } from "next/server";
import { getEndOfDaySnapshot } from "@/actions/endOfDay";

// Dış proje (adisyon sistemi) için gün sonu cirosu uç noktası.
// SADECE kapatılmış (dondurulmuş) günleri döndürür → değişmez, resmî rakam.
// Bugün/açık gün burada dönmez (404); o veri henüz kesinleşmemiştir.
//
// Erişim: GUN_SONU_API_TOKEN ile korumalı.
//   GET /api/gun-sonu?tarih=2026-06-04
//   Header: "Authorization: Bearer <token>"  (veya ?token=<token>)
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function GET(req: NextRequest) {
  const token = process.env.GUN_SONU_API_TOKEN;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("token") ??
    "";

  if (!token || provided !== token) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401, headers: CORS_HEADERS });
  }

  const date = req.nextUrl.searchParams.get("tarih") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "tarih parametresi gerekli (YYYY-MM-DD)" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  try {
    const snap = await getEndOfDaySnapshot(date);
    if (!snap) {
      return NextResponse.json(
        { error: "Bu gün henüz kapatılmadı" },
        { status: 404, headers: CORS_HEADERS },
      );
    }
    return NextResponse.json(
      { date, closedAt: snap.closedAt, source: snap.source, report: snap.report },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("[GET /api/gun-sonu]", err);
    return NextResponse.json(
      { error: "Gün sonu getirilemedi" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
