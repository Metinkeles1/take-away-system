import { NextRequest, NextResponse } from "next/server";
import { saveEndOfDaySnapshot } from "@/actions/endOfDay";
import { istanbulDateISO } from "@/lib/datetime";

// Vercel Cron — 00:30 IST (21:30 UTC) çalışır, bkz. vercel.json.
// Gece yarısını GEÇTİKTEN sonra çalışıp DÜNÜ dondurur: o gün tamamen kapanmış
// olur (23:55 kaybı yok) ve Hobby planında cron zamanı ~1 saate kadar kaysa
// bile sorun çıkmaz, çünkü bugünü değil kapanmış günü topluyoruz.
//
// Hobby planı notu: cron günde 1 kez çalışabilir (dakikalık olan yasak), bu
// uç nokta tam olarak günde 1 kez tetiklenir.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel Cron, "Authorization: Bearer <CRON_SECRET>" header'ı ile çağırır.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "yetkisiz" }, { status: 401 });
  }

  try {
    // Dünün Istanbul tarihi (YYYY-MM-DD).
    const yesterday = istanbulDateISO(Date.now() - 24 * 60 * 60 * 1000);
    const report = await saveEndOfDaySnapshot(yesterday, "cron");
    return NextResponse.json({
      ok: true,
      date: report.date,
      packageCount: report.packageCount,
      totalRevenue: report.totalRevenue,
    });
  } catch (err) {
    console.error("[GET /api/cron/gun-sonu]", err);
    return NextResponse.json({ ok: false, error: "Gün sonu dondurulamadı" }, { status: 500 });
  }
}
