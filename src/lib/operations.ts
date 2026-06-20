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
