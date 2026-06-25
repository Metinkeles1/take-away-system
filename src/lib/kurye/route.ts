// Kurye çoklu-durak rotası yardımcıları — hem /kurye sayfası hem RouteView kullanır.
// Saf matematik + URL üretimi; harita/UI yok, API/maliyet yok.

import { haversineMeters } from "@/lib/utils";
import type { Order } from "@/types";

// Pinli siparişleri dükkandan başlayarak "en yakın komşu" sırasına dizer. Kuş
// uçuşu (haversine) mesafe — gerçek yol değil; 3-5 durakta optimale çok yakın
// sonuç verir. Dükkan konumu yoksa listedeki ilk duraktan başlar. Yalnızca pini
// (customer.geo) olan siparişler durak olabilir — çağıran taraf öyle süzmeli.
export function orderStopsByProximity(
  stops: Order[],
  origin: { lat: number; lng: number } | null,
): Order[] {
  if (stops.length <= 1) return stops;
  const remaining = [...stops];
  const route: Order[] = [];
  let ref: { lat: number; lng: number } =
    origin ?? {
      lat: remaining[0].customer.geo!.lat,
      lng: remaining[0].customer.geo!.lng,
    };
  while (remaining.length) {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(ref, remaining[i].customer.geo!);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const [next] = remaining.splice(bestI, 1);
    route.push(next);
    ref = { lat: next.customer.geo!.lat, lng: next.customer.geo!.lng };
  }
  return route;
}

// Sıralı durakları tek Google Maps yol-tarifi linkine çevirir. Son durak
// "destination", aradakiler "waypoints" (verilen sırayı korur). origin VERİLMEZ
// → navigasyon kuryenin anlık konumundan başlar (yolda da basılabilir).
// Parametreler URL-encode'lu (virgül %2C, ayraç %7C) — Google Maps URL API kabul eder.
//
// pinlessTextStops: koordinatı olmayan (pinsiz) durakların metin adresleri.
// Verilirse pinli durakların SONUNA eklenir; Google bunları geocode eder.
// Koordinatları olmadığı için yakınlık sıralamasına giremezler → sona eklenir,
// kurye gerekirse Google'da düzeltir. (İsabet düşük olabilir — bilinçli ödün.)
export function buildGoogleRouteUrl(
  orderedStops: Order[],
  pinlessTextStops: string[] = [],
): string {
  const pts = [
    ...orderedStops.map((o) => `${o.customer.geo!.lat},${o.customer.geo!.lng}`),
    ...pinlessTextStops.filter((s) => s.trim().length > 0),
  ];
  if (pts.length === 0) return "https://www.google.com/maps";
  const params = new URLSearchParams({
    api: "1",
    destination: pts[pts.length - 1],
    travelmode: "driving",
  });
  const waypoints = pts.slice(0, -1).join("|");
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
