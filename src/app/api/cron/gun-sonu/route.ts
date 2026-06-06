import { NextRequest, NextResponse } from "next/server";
import { saveEndOfDaySnapshot } from "@/actions/endOfDay";
import { istanbulDateISO } from "@/lib/datetime";

// Vercel Cron — 23:59 IST (20:59 UTC) çalışır, bkz. vercel.json. Gün biterken
// O GÜNÜ dondurur (kullanıcı isteği). Trendyol cirosu da o anki settlement ile
// rapora dahil edilip sabitlenir.
//
// Hobby planı notu: cron günde 1 kez çalışır (dakikalık yasak) ve zamanı ~1
// saate kadar kayabilir. Bu yüzden tarih seçimi drift-safe: cron 23:59'da
// çalışırsa bugünü; eğer gece yarısını geçip ertesi sabaha kayarsa (IST saati
// öğleden önce) bir önceki günü dondurur — her iki halde de "kapanan gün".
export const dynamic = "force-dynamic";

// Cron'un "kapatması gereken günü" verir. IST öğleden sonra/akşam ise bugün;
// gece yarısını geçip sabaha kaydıysa (saat < 12) bir önceki gün.
function targetDate(now: number): string {
  const istClockHour = new Date(now + 3 * 60 * 60 * 1000).getUTCHours();
  const ref = istClockHour < 12 ? now - 24 * 60 * 60 * 1000 : now;
  return istanbulDateISO(ref);
}

export async function GET(req: NextRequest) {
  // Vercel Cron, "Authorization: Bearer <CRON_SECRET>" header'ı ile çağırır.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "yetkisiz" }, { status: 401 });
  }

  try {
    const date = targetDate(Date.now());
    const report = await saveEndOfDaySnapshot(date, "cron");
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
