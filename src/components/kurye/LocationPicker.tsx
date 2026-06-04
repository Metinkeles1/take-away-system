"use client";

// Kurye için harita üzerinde elle konum seçici. Leaflet'i yalnızca client-side
// (dinamik import) yükler — SSR'da window yok. Sürüklenebilir marker + haritaya
// dokununca marker oraya gider. GPS kalitesinden bağımsız: doğru noktayı insan koyar.
//
// Tam ekran overlay (Dialog değil): harita tüm ekranı kaplar. Dialog'un portal +
// açılış animasyonu + sınırlı boyut yarışı haritanın boş/kapalı kalmasına yol
// açıyordu; tam ekran sabit konteyner net boyuta sahip olduğu için harita her
// zaman güvenle açılır.

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Check, Crosshair, Loader2, MapPin, X } from "lucide-react";

export interface LatLng {
  lat: number;
  lng: number;
}

// Kırmızı damla pin — leaflet'in varsayılan ikon görseli bundler'da bozulabildiği
// için divIcon (saf HTML/SVG) kullanıyoruz; görsel yolu sorunu yaşanmaz.
const PIN_HTML = `
<div style="transform:translate(-50%,-100%);filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">
  <svg width="34" height="34" viewBox="0 0 24 24" fill="#e11d48" stroke="#fff" stroke-width="1.5">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.5" fill="#fff" stroke="none"/>
  </svg>
</div>`;

export function LocationPicker({
  open,
  center,
  addressLabel,
  saving,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  center: LatLng;
  addressLabel: string;
  saving: boolean;
  onConfirm: (geo: LatLng) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const timersRef = useRef<number[]>([]);
  const [picked, setPicked] = useState<LatLng>(center);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const el = containerRef.current as
      | (HTMLDivElement & { _leaflet_id?: number })
      | null;
    setPicked(center);

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el) return;
      if (el._leaflet_id) delete el._leaflet_id;

      const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(
        [center.lat, center.lng],
        17,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: PIN_HTML,
        iconSize: [34, 34],
        iconAnchor: [0, 0],
      });
      const marker = L.marker([center.lat, center.lng], {
        draggable: true,
        icon,
      }).addTo(map);

      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        setPicked({ lat: ll.lat, lng: ll.lng });
      });
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        setPicked({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      LRef.current = L;
      mapRef.current = map;
      markerRef.current = marker;

      // İlk frame'de konteyner boyutu tam oturmamış olabilir → invalidateSize ile
      // tile'ları yeniden iste. ResizeObserver en güvenilir yöntem; yedek olarak
      // birkaç gecikmeli deneme de var.
      const invalidate = () => {
        try {
          map.invalidateSize(false);
        } catch {
          // ignore
        }
      };
      const ro = new ResizeObserver(() => invalidate());
      ro.observe(el);
      roRef.current = ro;
      timersRef.current = [
        window.setTimeout(invalidate, 120),
        window.setTimeout(invalidate, 350),
        window.setTimeout(() => {
          invalidate();
          try {
            map.setView([center.lat, center.lng], 17);
          } catch {
            // ignore
          }
        }, 700),
      ];
    })();

    return () => {
      cancelled = true;
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // ignore
        }
        mapRef.current = null;
      }
      markerRef.current = null;
      LRef.current = null;
      if (el && el._leaflet_id) delete el._leaflet_id;
    };
  }, [open, center]);

  // Canlı GPS'e ortala (best-effort) — kurye dışarıdaysa hızlı hizalama.
  const goToMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        markerRef.current?.setLatLng([ll.lat, ll.lng]);
        mapRef.current?.setView([ll.lat, ll.lng], 18);
        setPicked(ll);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-1000 flex flex-col bg-slate-900">
      {/* Üst başlık */}
      <header className="flex shrink-0 items-center gap-3 bg-slate-900 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <MapPin className="h-5 w-5 shrink-0 text-rose-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">Konumu işaretle</p>
          <p className="truncate text-xs text-slate-400">{addressLabel}</p>
        </div>
        <button
          onClick={onCancel}
          disabled={saving}
          aria-label="Kapat"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-300 transition hover:bg-white/10 active:scale-90 disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* Harita — tüm boşluğu kaplar */}
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0 bg-slate-100" />
        {/* Haritaya dokun veya pini sürükle ipucu */}
        <div className="pointer-events-none absolute left-1/2 top-3 z-1100 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white shadow-md">
          Pini kapıya sürükle ya da haritaya dokun
        </div>
        {/* Sol-altta: Leaflet'in attribution/zoom kontrolleri sağ-üst/sağ-altta
            olduğu için burası boş kalır, buton hiçbir kontrolün arkasında kaybolmaz. */}
        <button
          onClick={goToMyLocation}
          disabled={locating}
          className="absolute bottom-4 left-4 z-1100 flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-lg ring-1 ring-slate-200 active:scale-95 disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4 text-blue-600" />
          )}
          Konumuma git
        </button>
      </div>

      {/* Alt aksiyon barı */}
      <div className="flex shrink-0 gap-2 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={saving}
        >
          Vazgeç
        </Button>
        <Button className="flex-1" onClick={() => onConfirm(picked)} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Bu konumu kaydet
        </Button>
      </div>
    </div>
  );
}
