// Açık hesap yaşlandırma yardımcıları (client-safe — server-only import yok).
// Açık hesabın oluşturulduğu andan beri geçen gün sayısına göre ton/etiket üretir.
// Eskiyen alacaklar öne çıksın diye liste bu süreye göre sıralanabilir.

// 3 günden eski → sarı (takip), 7 günden eski → kırmızı (riskli).
const AGING_WARN_DAYS = 3;
const AGING_DANGER_DAYS = 7;

export function daysOpen(createdAt: Date | string | number): number {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export type AgingLevel = "normal" | "warn" | "danger";

export function agingLevel(days: number): AgingLevel {
  if (days >= AGING_DANGER_DAYS) return "danger";
  if (days >= AGING_WARN_DAYS) return "warn";
  return "normal";
}

// Rozet için Tailwind sınıfları (v4 kanonik ölçek).
export const AGING_BADGE_CLASS: Record<AgingLevel, string> = {
  normal: "bg-slate-100 text-slate-600 border-slate-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  danger: "bg-red-100 text-red-700 border-red-200",
};

// "bugün" / "1 gün" / "12 gün"
export function agingLabel(days: number): string {
  return days <= 0 ? "bugün" : `${days} gün`;
}
