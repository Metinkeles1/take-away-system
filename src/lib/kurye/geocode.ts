// Metin adresini YAKLAŞIK koordinata çevirir. İstek kendi sunucumuzdaki
// /api/geocode proxy'sine gider (Nominatim CORS vermiyor). Yalnızca havuz harita
// seçim ekranında pinsizleri yaklaşık konumlamak için; kesin pini insan koyar,
// navigasyonu Google yapar.

export interface GeoHit {
  lat: number;
  lng: number;
}

// TR adres kısaltmalarını açar + kapı/kat/daire gürültüsünü atar (Nominatim açık
// yazımı daha iyi bulur; "No:12/4" gibi ekler eşleşmeyi bozar).
function normalizeTr(s: string): string {
  return s
    .replace(/\bmah\.?\b/gi, "mahallesi")
    .replace(/\bmh\.?\b/gi, "mahallesi")
    .replace(/\bcad\.?\b/gi, "caddesi")
    .replace(/\bcd\.?\b/gi, "caddesi")
    .replace(/\bsok\.?\b/gi, "sokak")
    .replace(/\bsk\.?\b/gi, "sokak")
    .replace(/\bbul\.?\b/gi, "bulvarı")
    .replace(/\bblv\.?\b/gi, "bulvarı")
    .replace(/\bno[:.]?\s*\d+[\/-]?\w*/gi, "")
    .replace(/\bkat[:.]?\s*\w+/gi, "")
    .replace(/\bdaire[:.]?\s*\w+/gi, "")
    .replace(/\bd[:.]\s*\w+/gi, "")
    .replace(/\s*,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

// Kademeli arama adayları: tam adres → mahalle + ilçe → ilçe. Önceki tutmazsa
// sonrakine düşülür; "en kötü mahalle/ilçe seviyesinde" yaklaşık konum verir.
function buildCandidates(parts: {
  address?: string;
  detail?: string;
  district?: string;
}): string[] {
  const address = (parts.address ?? "").trim();
  const district = (parts.district ?? "").trim();
  const detail = (parts.detail ?? "").trim();
  const full = normalizeTr([address, detail, district].filter(Boolean).join(", "));
  const mahalle = normalizeTr(address.split(",")[0] ?? "");
  const list: string[] = [];
  if (full) list.push(full);
  if (mahalle && district) list.push(normalizeTr(`${mahalle}, ${district}`));
  else if (mahalle) list.push(mahalle);
  if (district) list.push(district);
  return [...new Set(list.filter((s) => s.length > 0))];
}

export async function geocodeAddress(
  query: string,
  opts?: { near?: { lat: number; lng: number } },
): Promise<GeoHit | null> {
  const q = query.trim();
  if (!q) return null;
  const params = new URLSearchParams({ q });
  if (opts?.near) params.set("near", `${opts.near.lat},${opts.near.lng}`);
  try {
    const res = await fetch(`/api/geocode?${params.toString()}`);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      !data ||
      typeof data !== "object" ||
      typeof (data as GeoHit).lat !== "number" ||
      typeof (data as GeoHit).lng !== "number"
    ) {
      return null;
    }
    return { lat: (data as GeoHit).lat, lng: (data as GeoHit).lng };
  } catch {
    return null;
  }
}

// Sipariş adresini kademeli olarak geocode eder (tam → mahalle+ilçe → ilçe).
export async function geocodeOrderParts(
  parts: { address?: string; detail?: string; district?: string },
  opts?: { near?: { lat: number; lng: number } },
): Promise<GeoHit | null> {
  for (const candidate of buildCandidates(parts)) {
    const hit = await geocodeAddress(candidate, opts);
    if (hit) return hit;
  }
  return null;
}
