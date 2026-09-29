// Operasyonel SLA eşikleri — "geciken sipariş" tanımı tek kaynak.
// createdAt'tan beri hâlâ açık (teslim edilmemiş) bir siparişin yaşı bu
// eşikleri aşınca uyarı/kritik sayılır. İleride ayarlardan override edilebilir.

export const SLA_WARN_MIN = 45; // sarı uyarı eşiği (dk)
export const SLA_CRITICAL_MIN = 60; // kırmızı kritik eşik (dk)

export type SlaLevel = "ok" | "warn" | "critical";

// Bir siparişin yaşına (dk) göre SLA seviyesini döndürür.
export function slaLevel(ageMin: number): SlaLevel {
  if (ageMin >= SLA_CRITICAL_MIN) return "critical";
  if (ageMin >= SLA_WARN_MIN) return "warn";
  return "ok";
}

// Kurye ekranı "öncelik" işareti — sipariş yaşı kurye teslim hedefine
// (Ayarlar › deliveryTargetMin) göre. Uyarı/ses yok; sadece sessiz etiket:
//  • soon: hedefe PRIORITY_LEAD_MIN dk kala (sarı)
//  • late: hedef aşıldı (kırmızı)
export const PRIORITY_LEAD_MIN = 10;

export type PriorityLevel = "none" | "soon" | "late";

export function orderPriority(
  createdAt: string | Date,
  targetMin: number,
  now: number,
): PriorityLevel {
  const ageMin = (now - new Date(createdAt).getTime()) / 60_000;
  if (ageMin >= targetMin) return "late";
  if (ageMin >= targetMin - PRIORITY_LEAD_MIN) return "soon";
  return "none";
}
