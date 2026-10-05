import { NextResponse } from "next/server";
import { getCourierCash } from "@/actions/courierCash";

// Kuryedeki para okuması — panel sık yeniler; server action kuyruğuna
// girmesin diye GET (bkz. /api/courier/board).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCourierCash());
  } catch (err) {
    console.error("[GET /api/courier/cash]", err);
    return NextResponse.json({ error: "Kurye parası alınamadı" }, { status: 500 });
  }
}
