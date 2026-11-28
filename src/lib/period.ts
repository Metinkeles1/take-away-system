// "YYYY-MM" formatında aylık dönem.
export type Period = string;

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function currentPeriod(ref: Date = new Date()): Period {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" biçiminde tek bir ay mı (özel dönem / tarih aralığı değil)? */
export function isMonthPeriod(period: Period): boolean {
  return /^\d{4}-\d{2}$/.test(period);
}

/**
 * Tarih aralığı dönemi: "r:YYYY-MM-DD:YYYY-MM-DD" (iki uç dahil).
 * Ay dönemi gibi periodRange'den geçtiği için listeleme, istatistik ve
 * tahsilat işlemleri aralıkta da aynen çalışır.
 */
const RANGE_RE = /^r:(\d{4})-(\d{2})-(\d{2}):(\d{4})-(\d{2})-(\d{2})$/;

export function isRangePeriod(period: Period): boolean {
  return RANGE_RE.test(period);
}

/** İki "YYYY-MM-DD" değerinden aralık dönemi üretir (ters girilirse sıralar). */
export function makeRangePeriod(from: string, to: string): Period {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return `r:${a}:${b}`;
}

/** Aralık döneminin uçlarını "YYYY-MM-DD" olarak döndürür. */
export function rangePeriodBounds(period: Period): { from: string; to: string } | null {
  const m = RANGE_RE.exec(period);
  if (!m) return null;
  return { from: `${m[1]}-${m[2]}-${m[3]}`, to: `${m[4]}-${m[5]}-${m[6]}` };
}

export function periodRange(period: Period): { start: Date; end: Date } {
  const r = RANGE_RE.exec(period);
  if (r) {
    const [, y1, m1, d1, y2, m2, d2] = r.map(Number);
    const start = new Date(y1, m1 - 1, d1);
    const end = new Date(y2, m2 - 1, d2 + 1); // bitiş günü dahil
    if (end <= start) throw new Error(`Geçersiz tarih aralığı: ${period}`);
    return { start, end };
  }
  if (!isMonthPeriod(period)) throw new Error(`Geçersiz dönem: ${period}`);
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/**
 * Özel "dönem" değeri: tek bir ay yerine, kurumun tüm dönemlerindeki açık
 * (ödenmemiş) fişlerini kapsar. Açık hesap ekstresi/tahsilat için kullanılır.
 */
export const ALL_OPEN_PERIOD = "all-open";

/** Özel "dönem" değeri: kurumun tüm aylarındaki tüm fişleri (ödenmiş + açık). */
export const ALL_PERIODS = "all";

/** Tek ay değil, birden çok aya yayılan özel dönem mi? */
export function isMultiPeriod(period: Period): boolean {
  return period === ALL_OPEN_PERIOD || period === ALL_PERIODS;
}

export function formatPeriodLabel(period: Period): string {
  if (period === ALL_OPEN_PERIOD) return "Açık Hesap (Tüm Dönemler)";
  if (period === ALL_PERIODS) return "Tüm Dönemler";
  const range = rangePeriodBounds(period);
  if (range) {
    const fmt = (s: string) => s.split("-").reverse().join(".");
    return `${fmt(range.from)} – ${fmt(range.to)}`;
  }
  const [y, m] = period.split("-").map(Number);
  return `${TR_MONTHS[m - 1]} ${y}`;
}

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateShort(date: Date | string): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}
