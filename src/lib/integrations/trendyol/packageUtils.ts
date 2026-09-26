// Trendyol paketinden türetilen ortak alanlar — dashboard raporu ve sipariş
// arşivi aynı hesabı kullansın diye tek yerde.

import type { TrendyolPackage } from "./client";

// İptal/tedarik edilemedi → ciroya ve sipariş sayısına girmez.
export const NON_REVENUE_STATUSES = new Set(["Cancelled", "UnSupplied"]);

export const PAYMENT_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kapıda Kart",
  online: "Online Kart",
  meal_card: "Yemek Kartı",
};

// Trendyol'un yemek kartı identifier'larını ortak marka adına normalize eder.
// cardSourceType (online ödeme) ve onDelivery.paymentType (kapıda kod) için ortak.
export function normalizeMealCardBrand(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s.includes("MULTINET")) return "Multinet";
  if (s.includes("SODEXO") || s.includes("PLUXEE")) return "Sodexo / Pluxee";
  if (s.includes("METROPOL")) return "Metropol";
  if (s.includes("TICKET")) return "Ticket";
  if (s.includes("SETCARD") || s.includes("SET_CARD")) return "Setcard";
  if (s.includes("EDENRED") || s.includes("WINWIN") || s.includes("WIN_WIN")) return "Edenred";
  if (s.includes("TOKENFLEX") || s.includes("TOKEN_FLEX")) return "TokenFlex";
  if (s.includes("PAYE")) return "Paye";
  if (s.includes("SMARTPAY") || s.includes("SMART_PAY")) return "SmartPay";
  return null;
}

// Trendyol paymentType -> proje genelindeki ortak ödeme key'i (PAYMENT_LABELS).
// On-delivery için sub-type (CASH/CARD) okunur, yoksa "cash" varsayılır.
export function paymentKey(p: TrendyolPackage): string {
  const t = p.payment?.paymentType;
  if (t === "PAY_WITH_CARD") return "online";
  if (t === "PAY_WITH_MEAL_CARD") return "meal_card";
  if (t === "PAY_WITH_ON_DELIVERY") {
    const sub = p.payment?.onDelivery?.paymentType?.toUpperCase();
    if (sub === "CARD") return "card";
    if (sub === "CASH" || !sub) return "cash";
    // METROPOL_CODE / MULTINET_CODE vb. → "kod ile" yemek kartı. Para kapıda DEĞİL,
    // sağlayıcıdan bankaya gelir → online yemek kartı gibi hakedişe yazılır.
    if (normalizeMealCardBrand(sub)) return "meal_card";
    return "cash";
  }
  return "online";
}

// Bir paketin yemek kartı bilgisini (varsa) çıkarır. Yoksa null döner.
export function mealCardInfo(
  p: TrendyolPackage,
): { brand: string; source: "online" | "on_delivery" } | null {
  const t = p.payment?.paymentType;
  if (t === "PAY_WITH_MEAL_CARD") {
    const brand = normalizeMealCardBrand(p.payment?.mealCard?.cardSourceType) ?? "Diğer";
    return { brand, source: "online" };
  }
  if (t === "PAY_WITH_ON_DELIVERY") {
    const sub = p.payment?.onDelivery?.paymentType;
    const brand = normalizeMealCardBrand(sub);
    if (brand) return { brand, source: "on_delivery" };
  }
  return null;
}

// Satıcının karşıladığı indirim (promosyon + kupon).
export function sellerDiscount(p: TrendyolPackage): number {
  return (
    (p.promotions ?? []).reduce((s, pr) => s + (pr.totalSellerAmount ?? 0), 0) +
    (p.coupon?.totalSellerAmount ?? 0)
  );
}

// Settlement'a düşmemiş siparişte (yemek kartı / henüz vadesi gelmemiş) hakediş
// tahmini için oran — trendyolDashboard'daki FALLBACK ile aynı.
export const FALLBACK_COMMISSION_RATE = 0.138;

// Arşiv kaydının hakedişi: gerçek settlement toplamı, yoksa tahmin.
export function archivedNet(d: {
  netRevenue?: number | null;
  netTotal?: number | null;
  totalPrice?: number | null;
}): { net: number; estimated: boolean } {
  if (d.netRevenue != null) return { net: d.netRevenue, estimated: false };
  return {
    net: (d.netTotal ?? d.totalPrice ?? 0) * (1 - FALLBACK_COMMISSION_RATE),
    estimated: true,
  };
}
