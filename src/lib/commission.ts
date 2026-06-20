// Kanal bazlı komisyon oranları — dashboard'da "Tahmini Net" hesabı için tek
// kaynak. Trendyol'un GERÇEK neti settlement API'sinden (gün-sonu) gelir; bu
// harita canlı dashboard için yaklaşık bir net üretir, settlement gecikmeli
// düştüğü için. İleride ayarlardan override edilebilir (varsayılan değerler).
//
// Oranlar brüt ciro üzerinden efektif komisyon (KDV/indirim dahil yaklaşık).
// Kapıda (manuel) siparişte komisyon yoktur → net = ciro.

import { type OrderSource } from "@/types";

export const COMMISSION_RATES: Record<OrderSource, number> = {
  manual: 0,
  trendyol: 0.18,
  getir: 0.16,
  yemeksepeti: 0.16,
};

// Yemek kartı/kod ödemelerinde sağlayıcı ek kesintisi (ör. çok-kart %10).
// Trendyol gün-sonu mantığıyla tutarlı: yemek kartı kaleminde ekstra düşülür.
export const MEAL_CARD_PROVIDER_CUT = 0.1;

// Tek bir siparişin tahmini netini döndürür.
//   source: sipariş kanalı (yoksa "manual" varsayılır — eski kayıtlar)
//   isMealCard: ödeme yöntemi yemek kartı mı (ek kesinti uygulanır)
export function estimateOrderNet(
  total: number,
  source: OrderSource | undefined,
  isMealCard = false,
): number {
  const rate = COMMISSION_RATES[source ?? "manual"] ?? 0;
  let net = total * (1 - rate);
  if (isMealCard) net *= 1 - MEAL_CARD_PROVIDER_CUT;
  return net;
}
