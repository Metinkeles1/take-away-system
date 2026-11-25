import { NextRequest, NextResponse } from "next/server";
import { ackPrintJobs, authPrintAgent, isValidDeviceId } from "@/lib/printAgent/agent";

// Program fişi bastı (ya da basamadı) → kuyruktan düş / hata say.
//   POST /api/print-agent/ack   Gövde: { deviceId, results: [{ id, ok, error? }] }
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Result = { id: string; ok: boolean; error?: string };

export async function POST(req: NextRequest) {
  const cfg = await authPrintAgent(req.headers.get("authorization"));
  if (!cfg) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  try {
    const json = await req.json();
    if (!isValidDeviceId(json?.deviceId)) {
      return NextResponse.json({ error: "deviceId gerekli" }, { status: 400 });
    }
    const raw: unknown[] = Array.isArray(json?.results) ? json.results : [];
    const results: Result[] = raw
      .filter((r): r is Result => !!r && typeof (r as { id?: unknown }).id === "string")
      .map((r) => ({
        id: r.id,
        ok: r.ok === true,
        error: typeof r.error === "string" ? r.error : undefined,
      }));
    await ackPrintJobs(json.deviceId, results);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/print-agent/ack]", err);
    return NextResponse.json({ error: "kaydedilemedi" }, { status: 500 });
  }
}
