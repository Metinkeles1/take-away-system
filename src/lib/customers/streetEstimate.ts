import { haversineMeters } from "@/lib/utils";
import type { StreetParts } from "@/lib/customers/streetKey";

// Sokak hafızası tahmini — saf fonksiyon. Aynı sokaktaki pinli adreslerden
// (refs) pinsiz bir adresin YAKLAŞIK konumunu çıkarır:
//   1. Aynı kapı no pinliyse → o bina (en güvenilir)
//   2. Numaranın iki yanında pinli numara varsa → aralarına orantılı yerleştir
//   3. Tek yanda varsa → en yakın numaranın yanına
//   4. Kapı no bilinmiyorsa → sokaktaki pinlerin ortası
// Tahmin asla gerçek pin gibi kaydedilmez; ekranda "tahmini" olarak gösterilir,
// insan onaylayınca gerçek pine döner.

export interface StreetRef {
  mahalle?: string;
  doorNo?: number;
  district?: string;
  lat: number;
  lng: number;
  // "own": kendi müşteri kaydımızdaki pin (insan onaylı) — "trendyol": Trendyol
  // siparişinde müşterinin haritada seçtiği pin (daha az güvenilir).
  source?: "own" | "trendyol";
}

export type StreetEstimateKind = "building" | "between" | "near" | "street";

export interface StreetEstimate {
  lat: number;
  lng: number;
  kind: StreetEstimateKind;
  label: string; // ekranda gösterilen kısa açıklama
}

// Mahalle bilinmiyorken aynı isimli sokağın pinleri bu kadar dağınıksa
// büyük ihtimalle farklı mahallelerdeki aynı adlı sokaklardır → tahmin yok.
const AMBIGUOUS_SPREAD_M = 1500;
// İki yandaki pinler bundan uzaksa (hatalı GPS pini ya da sokak çok uzun)
// araya yerleştirme güvenilmez → en yakın numaraya düş.
const MAX_INTERP_GAP_M = 800;

const foldDistrict = (s?: string) =>
  (s ?? "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

function centroid(pts: { lat: number; lng: number }[]) {
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };
}

// Aynı numarada kendi pinimiz varsa yalnız onu kullan; yoksa Trendyol pinleri.
function preferOwn(pts: StreetRef[]): StreetRef[] {
  const own = pts.filter((p) => p.source !== "trendyol");
  return own.length > 0 ? own : pts;
}

function maxSpread(pts: { lat: number; lng: number }[]): number {
  let max = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      max = Math.max(max, haversineMeters(pts[i], pts[j]));
  return max;
}

export function estimateFromStreet(
  target: StreetParts & { district?: string },
  allRefs: StreetRef[],
): StreetEstimate | null {
  const tDistrict = foldDistrict(target.district);
  const refs = allRefs.filter(
    (r) =>
      (!target.mahalle || !r.mahalle || r.mahalle === target.mahalle) &&
      (!tDistrict || !r.district || foldDistrict(r.district) === tDistrict),
  );
  if (refs.length === 0) return null;
  if (!target.mahalle && maxSpread(refs) > AMBIGUOUS_SPREAD_M) return null;

  const n = target.doorNo;
  const numbered = refs.filter((r) => r.doorNo != null);
  if (n == null || numbered.length === 0) {
    return {
      ...centroid(refs),
      kind: "street",
      label: `Aynı sokakta ${refs.length} kayıtlı adrese göre`,
    };
  }

  const same = numbered.filter((r) => r.doorNo === n);
  if (same.length > 0) {
    return { ...centroid(preferOwn(same)), kind: "building", label: `Aynı bina (No ${n})` };
  }

  // Türkiye'de çoğu sokakta tek numaralar bir yanda, çiftler öbür yanda —
  // aynı yandaki numaralar varsa onlarla hesapla.
  const sameSide = numbered.filter((r) => r.doorNo! % 2 === n % 2);
  const pool = sameSide.length > 0 ? sameSide : numbered;

  const lowerNo = Math.max(
    ...pool.filter((r) => r.doorNo! < n).map((r) => r.doorNo!),
  );
  const higherNo = Math.min(
    ...pool.filter((r) => r.doorNo! > n).map((r) => r.doorNo!),
  );
  const at = (no: number) => centroid(preferOwn(pool.filter((r) => r.doorNo === no)));

  const hasLower = Number.isFinite(lowerNo);
  const hasHigher = Number.isFinite(higherNo);
  if (
    hasLower &&
    hasHigher &&
    haversineMeters(at(lowerNo), at(higherNo)) <= MAX_INTERP_GAP_M
  ) {
    const a = at(lowerNo);
    const b = at(higherNo);
    const t = (n - lowerNo) / (higherNo - lowerNo);
    return {
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
      kind: "between",
      label: `No ${lowerNo} ile ${higherNo} arası`,
    };
  }
  const nearestNo =
    hasLower && hasHigher
      ? n - lowerNo <= higherNo - n
        ? lowerNo
        : higherNo
      : hasLower
        ? lowerNo
        : higherNo;
  return { ...at(nearestNo), kind: "near", label: `Aynı sokakta en yakın: No ${nearestNo}` };
}
