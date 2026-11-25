import { NextResponse } from "next/server";
import { readAgentScript } from "@/lib/printAgent/agent";

// Programın kendisi (agent.ps1). Kurulum ve otomatik güncelleme buradan indirir.
// Gizli bilgi içermez (adres/anahtar bilgisayardaki config.json'da).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { bytes } = await readAgentScript();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/print-agent/script]", err);
    return NextResponse.json({ error: "program dosyası bulunamadı" }, { status: 500 });
  }
}
