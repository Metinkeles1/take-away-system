// "YYYY-MM" formatında aylık dönem.
export type Period = string;

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function currentPeriod(ref: Date = new Date()): Period {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
}

export function periodRange(period: Period): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/**
 * Özel "dönem" değeri: tek bir ay yerine, kurumun tüm dönemlerindeki açık
 * (ödenmemiş) fişlerini kapsar. Açık hesap ekstresi/tahsilat için kullanılır.
 */
export const ALL_OPEN_PERIOD = "all-open";

export function formatPeriodLabel(period: Period): string {
  if (period === ALL_OPEN_PERIOD) return "Açık Hesap (Tüm Dönemler)";
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
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}
