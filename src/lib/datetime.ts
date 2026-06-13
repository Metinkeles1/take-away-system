// Sunucu TZ'sinden bağımsız Istanbul-saatine göre tarih yardımcıları.
//
// Sebep: Vercel UTC çalışır, `new Date(y, m, d)` yerel TZ'ye göre gece yarısı
// verir → Istanbul ile 3 saatlik kayma → "bugün" filtresi dünün siparişlerini
// kapsar. Bu modül her zaman Istanbul gününü baz alır.
//
// Türkiye 2016'dan beri DST'siz, sabit UTC+3. Bu sabit hipotez değişirse
// (TR tekrar DST'ye dönerse) burada güncellenir; aramaya başlama noktası bu
// dosya.

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

// Istanbul saatine göre o günün 00:00'ı, UTC tabanlı Date olarak döner.
// Örn. Istanbul 2026-05-17 01:00 → çıktı = 2026-05-16 21:00 UTC (= 17.05 00:00 IST)
export function istanbulDayStart(reference: Date | number = new Date()): Date {
  const ref = typeof reference === "number" ? new Date(reference) : reference;
  const ist = new Date(ref.getTime() + ISTANBUL_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  return new Date(Date.UTC(y, m, d) - ISTANBUL_OFFSET_MS);
}

// Istanbul saatine göre N gün önceki günün 00:00'ı.
export function istanbulDayStartDaysAgo(
  days: number,
  reference: Date | number = new Date(),
): Date {
  const start = istanbulDayStart(reference);
  return new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
}

// "YYYY-MM-DD" tarihine N gün ekler/çıkarır, yine "YYYY-MM-DD" döner.
export function isoPlusDays(iso: string, days: number): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Gün gezgini etiketi: offset 0=Bugün, 1=Dün, diğerleri TR tarih (Çar 11 Haz).
export function dayLabelTR(dateISO: string, offset: number): string {
  if (offset === 0) return "Bugün";
  if (offset === 1) return "Dün";
  const dt = new Date(`${dateISO}T00:00:00Z`);
  return dt.toLocaleDateString("tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Istanbul gününü "YYYY-MM-DD" olarak verir (gün sonu snapshot anahtarı).
// Örn. cron 00:30 IST'de çalışıp dünü dondurmak için:
//   istanbulDateISO(Date.now() - 24 * 60 * 60 * 1000)
export function istanbulDateISO(reference: Date | number = new Date()): string {
  const start = istanbulDayStart(reference);
  const ist = new Date(start.getTime() + ISTANBUL_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = `${ist.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${ist.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
