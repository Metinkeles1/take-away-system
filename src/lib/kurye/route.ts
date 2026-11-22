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

// Sıralı durakları tek Google Maps yol-tarifi linkine çevirir (verilen sırayı
// korur; son durak varış noktası).
//
// pinlessTextStops: koordinatı olmayan (pinsiz) durakların metin adresleri.
// Verilirse pinli durakların SONUNA eklenir; Google bunları geocode eder.
// Koordinatları olmadığı için yakınlık sıralamasına giremezler → sona eklenir,
// kurye gerekirse Google'da düzeltir. (İsabet düşük olabilir — bilinçli ödün.)
//
// extraCoordStops: koordinatı SONRADAN bulunmuş (geocode edilmiş) durakların
// lat/lng'i. Google'ın mobil uygulaması "waypoints" alanında koordinat ve düz
// metni KARIŞIK verince bazen bozuluyor (bazı duraklar atlanıyor / tek durağa
// düşüyor) — bu yüzden mümkün olduğunca her şeyi koordinata çevirip
// (extraCoordStops) yalnızca gerçekten hiç bulunamayanları metin olarak en
// sona (pinlessTextStops) ekliyoruz.
//
// origin: kuryenin son GPS konumu (bkz. getRecentDeviceLocation). Boş
// bırakılırsa Google Maps kendi "anlık konum" algısını kullanır — kapalı
// alanda/GPS henüz sabitlenmemişken bu, rotanın kuryenin GERÇEK yerinden
// FARKLI bir noktadan başlamasına yol açabiliyordu.
//
// En fazla 10 durak (Google'ın çok duraklı yol tarifi sınırı); üstü bozuluyor.
//
// BİÇİM: "?api=1&waypoints=a|b" yerine YOL biçimi (/maps/dir/başlangıç/a/b/c).
// api=1 biçiminde Google ara durakları bazen yok sayıp yalnızca son adresi
// gösteriyordu (özellikle link uygulama yerine mobil tarayıcıda açılınca —
// orada en fazla 3 waypoint kabul ediliyor). Yol biçimi, Google'ın kendisinin
// çok duraklı rota paylaşırken ürettiği biçim; uygulama da tarayıcı da aynı okur.
// Başlangıç boş bırakılırsa ("dir//a/b") Google "Konumunuz"dan başlatır.
const MAX_GOOGLE_STOPS = 10;

const coord = (c: { lat: number; lng: number }) =>
  `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;

// Metin adres yol parçası olacağı için "/" (ör. "No:12/4") yolu böler → boşluk.
const textSegment = (s: string) =>
  encodeURIComponent(s.replace(/\//g, " ").replace(/\s{2,}/g, " ").trim());

export function buildGoogleRouteUrl(
  orderedStops: Order[],
  extraCoordStops: { lat: number; lng: number }[] = [],
  pinlessTextStops: string[] = [],
  origin?: { lat: number; lng: number } | null,
): string {
  const pts = [
    ...orderedStops.map((o) => coord(o.customer.geo!)),
    ...extraCoordStops.map(coord),
    ...pinlessTextStops
      .filter((s) => s.trim().length > 0)
      .map(textSegment),
  ].slice(0, MAX_GOOGLE_STOPS);
  if (pts.length === 0) return "https://www.google.com/maps";
  const start = origin ? coord(origin) : "";
  return `https://www.google.com/maps/dir/${start}/${pts.join("/")}`;
}

// Rota linkini tıklama içinde SENKRON açar (araya await girerse mobil tarayıcı
// popup'ı engeller). Yeni sekme açılamazsa (engelleyici / PWA) aynı sekmede açar.
export function openRouteUrl(url: string): void {
  if (typeof window === "undefined") return;
  const win = window.open(url, "_blank");
  if (!win) window.location.href = url;
}
