// Metin adresini YAKLAŞIK koordinata çevirir. İstek kendi sunucumuzdaki
// /api/geocode proxy'sine gider (Nominatim CORS vermiyor). Yalnızca havuz harita
// seçim ekranında pinsizleri yaklaşık konumlamak için; kesin pini insan koyar,
// navigasyonu Google yapar.

import { estimateStreetGeos } from "@/actions/streetMemory";

export interface GeoHit {
  lat: number;
  lng: number;
}

// Pinsiz siparişin yaklaşık konumu + nereden geldiği (ekranda gösterilir).
export interface ApproxHit extends GeoHit {
  fromStreet: boolean; // true: kendi pinlerimizden (sokak hafızası)
  label: string;
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

// Pinsiz siparişleri yaklaşık konumlar: önce sokak hafızası (aynı sokaktaki
// pinli adreslerimiz — tek sunucu çağrısı), bulunamayanlar için OpenStreetMap
// kademeli araması. Sonuç sipariş id'sine göre.
export async function locateOrders(
  orders: {
    id: string;
    customer: { address: string; addressDetail?: string; district?: string };
  }[],
  opts?: { near?: { lat: number; lng: number }; isCancelled?: () => boolean },
): Promise<Record<string, ApproxHit>> {
  const found: Record<string, ApproxHit> = {};
  if (orders.length === 0) return found;
  try {
    const street = await estimateStreetGeos(
      orders.map((o) => ({
        id: o.id,
        address: o.customer.address,
        addressDetail: o.customer.addressDetail,
        district: o.customer.district,
      })),
    );
    for (const [id, e] of Object.entries(street)) {
      found[id] = { lat: e.lat, lng: e.lng, fromStreet: true, label: e.label };
    }
  } catch {
    // Sokak hafızası ulaşılamazsa OSM'e düş.
  }
  for (const o of orders) {
    if (found[o.id]) continue;
    if (opts?.isCancelled?.()) return found;
    const hit = await geocodeOrderParts(
      {
        address: o.customer.address,
        detail: o.customer.addressDetail,
        district: o.customer.district,
      },
      { near: opts?.near },
    );
    if (hit) found[o.id] = { ...hit, fromStreet: false, label: "Harita aramasına göre" };
  }
  return found;
}

// Cihaz GPS konumu — rota linkine "origin" olarak eklemek için. Google Maps
// origin verilmezse KENDİ önbelleğindeki/ağ tabanlı konumu kullanabiliyor;
// kapalı alanda (dükkanın içi) bu, rotanın kuryenin gerçek yerinden FARKLI bir
// noktadan başlamasına yol açıyordu.
//
// Konum butona basıldığında DEĞİL, önceden (ekran/sheet açılınca) alınıp
// saklanır: tıklamada konumu `await` edip sonra sekme açmak mobilde bozuluyordu —
// ya popup engelleniyor ya da önceden açılan boş sekme about:blank'te kalıyordu
// (arka plana düşen sayfada GPS isteği askıda kalır). Tıklama anında yalnızca
// elde hazır olan son konum SENKRON okunur.
let lastFix: { hit: GeoHit; at: number } | null = null;

export function warmDeviceLocation(): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lastFix = {
        hit: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        at: Date.now(),
      };
    },
    () => {},
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
  );
}

// Son alınan konum yeterince tazeyse döner; yoksa null — çağıran origin'i boş
// bırakıp Google'ın kendi konumuna düşer.
export function getRecentDeviceLocation(maxAgeMs = 2 * 60_000): GeoHit | null {
  if (!lastFix || Date.now() - lastFix.at > maxAgeMs) return null;
  return lastFix.hit;
}
