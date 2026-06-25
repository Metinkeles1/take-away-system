"use client";

// Havuzdan/teslimat listesinden HARİTA ile toplu seçim. İki mod:
//  • mode="claim" (çoklu kurye): seçilenleri ÜSTLEN → kendi paketlerine geçir,
//    kalanlar havuzda. Üstlendikten sonra "Yol Tarifi Al" çıkar.
//  • mode="route" (tek kurye / planlama): üstlenme yok; seçilenlere doğrudan
//    "Yol Tarifi" — bu sefer taşıyacağın partiyi seçip Google rotası açarsın.
//
// Pinsiz adresler de haritada gösterilir: açılışta geocode edilip sokak/mahalle
// seviyesinde turuncu (yaklaşık) işaretle çıkar — kurye nerede olduğunu görüp
// rahatça seçer. Kesinlik gerekmez (sadece seçim için); navigasyonu Google yapar.
// Üstte canlı özet (adet · ≈km · ₺) seçtikçe güncellenir.

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { X, Check, Loader2, Navigation, AlertTriangle } from "lucide-react";
import type { Order } from "@/types";
import type { ShopLocation } from "@/actions/settings";
import { cn, formatCurrency, formatDistance, haversineMeters } from "@/lib/utils";
import { buildGoogleRouteUrl, orderStopsByProximity } from "@/lib/kurye/route";
import { geocodeOrderParts, type GeoHit } from "@/lib/kurye/geocode";

// Bu sayının üstünde seçimde nazik uyarı (motorla taşıma + Google ~10 durak sınırı).
const CAPACITY_WARN = 7;

const PIN_SEL = `<div style="transform:translate(-50%,-50%);display:grid;place-items:center;width:28px;height:28px;border-radius:9999px;background:#16a34a;color:#fff;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.35)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>`;
const PIN_FREE = `<div style="transform:translate(-50%,-50%);width:22px;height:22px;border-radius:9999px;background:#fff;border:3px solid #4f46e5;box-shadow:0 2px 4px rgba(0,0,0,.3)"></div>`;
const PIN_FREE_APPROX = `<div style="transform:translate(-50%,-50%);width:22px;height:22px;border-radius:9999px;background:#fff;border:3px dashed #d97706;box-shadow:0 2px 4px rgba(0,0,0,.3)"></div>`;
const PIN_TAKEN = `<div style="transform:translate(-50%,-50%);width:18px;height:18px;border-radius:9999px;background:#94a3b8;border:2px solid #fff;opacity:.65"></div>`;
const PIN_SHOP = `<div style="transform:translate(-50%,-50%);display:grid;place-items:center;width:28px;height:28px;border-radius:9999px;background:#0f172a;color:#fff;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.35)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l2-4h16l2 4"/><path d="M4 7v13h16V7"/><path d="M9 20v-6h6v6"/></svg></div>`;

function shortAddr(o: Order): string {
  return [o.customer.address, o.customer.district].filter(Boolean).join(", ");
}
function fullTextAddress(o: Order): string {
  return [o.customer.address, o.customer.addressDetail, o.customer.district]
    .filter(Boolean)
    .join(", ");
}

export function PoolMapSelect({
  open,
  orders,
  courier,
  shopLocation,
  onClose,
  onClaim,
  mode = "claim",
}: {
  open: boolean;
  orders: Order[];
  courier: string | null;
  shopLocation: ShopLocation | null;
  onClose: () => void;
  // claim modunda zorunlu — seçilen id'leri üstlenir. route modunda kullanılmaz.
  onClaim?: (ids: string[]) => Promise<void>;
  mode?: "claim" | "route";
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [claiming, setClaiming] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [approxCoords, setApproxCoords] = useState<Record<string, GeoHit>>({});
  const [geocoding, setGeocoding] = useState(false);
  // claim modunda üstlendikten sonra: seçilen paketler (yol tarifi ekranı).
  const [claimedView, setClaimedView] = useState<Order[] | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  // Seçilebilir küme: claim → havuzdaki boşlar; route → tüm gelen paketler (üstlenme yok).
  const selectable =
    mode === "claim" ? orders.filter((o) => !o.courier) : orders;
  const selPinned = selectable.filter((o) => o.customer.geo);
  const selPinless = selectable.filter((o) => !o.customer.geo);
  // Başkasının üstlendiği pinli paketler — yalnızca claim modunda gri bağlam.
  const takenPinned =
    mode === "claim"
      ? orders.filter(
          (o) => o.courier && o.courier !== courier && o.customer.geo,
        )
      : [];

  const coordOf = (o: Order): { lat: number; lng: number } | null => {
    if (o.customer.geo) return { lat: o.customer.geo.lat, lng: o.customer.geo.lng };
    const a = approxCoords[o.id];
    return a ? { lat: a.lat, lng: a.lng } : null;
  };
  const onMapStops = selectable.filter((o) => coordOf(o));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setClaimedView(null);
    }
  }, [open]);

  // Pinsizleri açılışta geocode et (haritada yaklaşık göstermek için).
  const pinlessKey = selPinless.map((o) => o.id).join(",");
  useEffect(() => {
    if (!open) return;
    if (selPinless.length === 0) {
      setApproxCoords({});
      return;
    }
    let cancelled = false;
    setGeocoding(true);
    (async () => {
      const found: Record<string, GeoHit> = {};
      for (const o of selPinless) {
        if (cancelled) return;
        const hit = await geocodeOrderParts(
          {
            address: o.customer.address,
            detail: o.customer.addressDetail,
            district: o.customer.district,
          },
          {
            near: shopLocation
              ? { lat: shopLocation.lat, lng: shopLocation.lng }
              : undefined,
          },
        );
        if (hit) found[o.id] = hit;
      }
      if (cancelled) return;
      setApproxCoords(found);
      setGeocoding(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pinlessKey]);

  // Haritayı kur.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMapReady(false);
    const el = containerRef.current as
      | (HTMLDivElement & { _leaflet_id?: number })
      | null;
    const initCenter = shopLocation ??
      selPinned[0]?.customer.geo ?? { lat: 41.0082, lng: 28.9784 };

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el) return;
      if (el._leaflet_id) delete el._leaflet_id;
      const map = L.map(el, { zoomControl: true, attributionControl: true });
      map.setView([initCenter.lat, initCenter.lng], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      LRef.current = L;
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
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
      setTimeout(invalidate, 120);
      setTimeout(invalidate, 350);
    })();

    return () => {
      cancelled = true;
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
      layerRef.current = null;
      LRef.current = null;
      setMapReady(false);
      if (el && el._leaflet_id) delete el._leaflet_id;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // İlk açılışta/yeni geocode'da tüm noktalara sığdır (seçimde tekrar zoom yapma).
  const approxKey = Object.keys(approxCoords).sort().join(",");
  const fitKey = [
    ...onMapStops.map((o) => o.id),
    ...takenPinned.map((o) => o.id),
  ].join(",");
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!open || !mapReady || !L || !map) return;
    const pts: [number, number][] = [];
    if (shopLocation) pts.push([shopLocation.lat, shopLocation.lng]);
    for (const o of onMapStops) {
      const c = coordOf(o)!;
      pts.push([c.lat, c.lng]);
    }
    for (const o of takenPinned) pts.push([o.customer.geo!.lat, o.customer.geo!.lng]);
    if (pts.length === 0) return;
    try {
      map.fitBounds(L.latLngBounds(pts).pad(0.2));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mapReady, fitKey]);

  // İşaretçileri çiz (fit yok → zoom sabit).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!open || !mapReady || !L || !map || !layer) return;
    layer.clearLayers();

    if (shopLocation) {
      L.marker([shopLocation.lat, shopLocation.lng], {
        icon: L.divIcon({ className: "", html: PIN_SHOP, iconSize: [28, 28] }),
        interactive: false,
      }).addTo(layer);
    }
    for (const o of takenPinned) {
      L.marker([o.customer.geo!.lat, o.customer.geo!.lng], {
        icon: L.divIcon({ className: "", html: PIN_TAKEN, iconSize: [18, 18] }),
        interactive: false,
      }).addTo(layer);
    }
    for (const o of onMapStops) {
      const c = coordOf(o)!;
      const sel = selected.has(o.id);
      const approx = !o.customer.geo;
      const m = L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: "",
          html: sel ? PIN_SEL : approx ? PIN_FREE_APPROX : PIN_FREE,
          iconSize: sel ? [28, 28] : [22, 22],
        }),
      }).addTo(layer);
      m.on("click", () => toggleRef.current(o.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mapReady, selected, approxKey, fitKey]);

  if (!open) return null;

  const allIds = selectable.map((o) => o.id);
  const allSelected = allIds.length > 0 && selected.size === allIds.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds));

  const selectedOrders = selectable.filter((o) => selected.has(o.id));
  const selectedTotal = selectedOrders.reduce((s, o) => s + o.total, 0);

  // Seçilenlerin (pinli + geocode'lu pinsiz) yakınlık sırası toplam mesafesi.
  const selectedMeters = (() => {
    const withGeo: Order[] = selectedOrders
      .map((o) => {
        const c = coordOf(o);
        return c
          ? ({
              ...o,
              customer: { ...o.customer, geo: { lat: c.lat, lng: c.lng } },
            } as Order)
          : null;
      })
      .filter((o): o is Order => o !== null);
    if (withGeo.length === 0) return 0;
    const ordered = orderStopsByProximity(withGeo, shopLocation);
    let sum = 0;
    let prev: { lat: number; lng: number } | null = shopLocation
      ? { lat: shopLocation.lat, lng: shopLocation.lng }
      : null;
    for (const o of ordered) {
      const g = o.customer.geo!;
      if (prev) sum += haversineMeters(prev, g);
      prev = { lat: g.lat, lng: g.lng };
    }
    return sum;
  })();

  // Verilen paketler için Google rota linki (pinli koordinat + pinsiz metin).
  const routeUrlFor = (list: Order[]) =>
    buildGoogleRouteUrl(
      orderStopsByProximity(
        list.filter((o) => o.customer.geo),
        shopLocation,
      ),
      list.filter((o) => !o.customer.geo).map(fullTextAddress),
    );

  const confirmClaim = async () => {
    if (selected.size === 0 || claiming || !onClaim) return;
    setClaiming(true);
    const picked = orders.filter((o) => selected.has(o.id));
    await onClaim([...selected]);
    setClaiming(false);
    setClaimedView(picked);
  };

  const summaryLine =
    selected.size > 0
      ? `${selected.size} paket${selectedMeters > 0 ? ` · ≈ ${formatDistance(selectedMeters)}` : ""} · ${formatCurrency(selectedTotal)}`
      : null;

  // Düz render fonksiyonu (bileşen DEĞİL) — render içinde bileşen tanımlamak her
  // render'da remount'a yol açardı; bu şekilde satırlar key ile korunur.
  const renderRow = (o: Order) => {
    const sel = selected.has(o.id);
    const itemCount = o.items.reduce((s, i) => s + i.quantity, 0);
    const approx = !o.customer.geo;
    const located = !approx || !!approxCoords[o.id];
    return (
      <button
        key={o.id}
        onClick={() => toggle(o.id)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 transition active:scale-[0.99]",
          sel ? "bg-emerald-50 ring-emerald-300" : "bg-white ring-slate-200",
        )}
      >
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-lg ring-1 transition",
            sel
              ? "bg-emerald-500 text-white ring-emerald-500"
              : "bg-white ring-slate-300",
          )}
        >
          {sel && <Check className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">
              #{o.orderNumber}
            </span>
            {approx && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold",
                  located
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-500",
                )}
              >
                {located ? "≈ yaklaşık" : "konum yok"}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-600">
            {shortAddr(o)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {o.customer.name} · {itemCount} ürün · {formatCurrency(o.total)}
          </p>
        </div>
      </button>
    );
  };

  const title = claimedView
    ? "Üstlenildi 🎉"
    : mode === "route"
      ? "Haritada Planla"
      : "Paket seç";
  const subtitle = claimedView
    ? `${claimedView.length} paket senin — yol tarifini aç`
    : summaryLine
      ? summaryLine
      : geocoding
        ? "Pinsiz konumlar bulunuyor…"
        : mode === "route"
          ? "Bu sefer götüreceklerini seç"
          : "Rotana uyanlara dokun — kalanlar havuzda kalır";

  return (
    <div className="fixed inset-0 z-1000 flex flex-col bg-slate-100">
      <header className="flex shrink-0 items-center gap-3 bg-slate-900 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">{title}</p>
          <p className="truncate text-xs text-slate-400">{subtitle}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-300 transition hover:bg-white/10 active:scale-90"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative h-[42vh] shrink-0">
        <div ref={containerRef} className="absolute inset-0 bg-slate-200" />
      </div>

      {claimedView ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="rounded-2xl bg-white p-4 text-center ring-1 ring-slate-200">
            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-emerald-100">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="font-bold text-slate-800">
              {claimedView.length} paket üstlenildi
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Kalanlar havuzda — diğer kurye seçebilir.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {selectable.length > 1 && (
            <button
              onClick={toggleAll}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 transition active:scale-[0.99]"
            >
              {allSelected
                ? "Seçimi temizle"
                : `Tümünü seç (${selectable.length})`}
            </button>
          )}
          {selected.size >= CAPACITY_WARN && (
            <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {selected.size} durak çok olabilir — taşıma kapasitesi ve Google ~10
              durak sınırına dikkat.
            </p>
          )}
          {selPinned.map(renderRow)}
          {selPinless.map(renderRow)}
          {selectable.length === 0 && (
            <p className="px-1 py-6 text-center text-sm font-medium text-slate-500">
              {mode === "route" ? "Paket yok 🎉" : "Havuzda boş paket kalmadı 🎉"}
            </p>
          )}
        </div>
      )}

      <div className="shrink-0 border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {claimedView ? (
          <div className="flex items-stretch gap-2">
            <button
              onClick={onClose}
              className="w-24 shrink-0 rounded-2xl bg-slate-100 py-4 text-sm font-bold text-slate-600 transition active:scale-95"
            >
              Kapat
            </button>
            <a
              href={routeUrlFor(claimedView)}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white shadow-sm shadow-indigo-600/25 transition active:scale-[0.98]"
            >
              <Navigation className="h-5 w-5 fill-white" />
              Yol Tarifi Al ({claimedView.length} durak)
            </a>
          </div>
        ) : mode === "route" ? (
          selected.size > 0 ? (
            <a
              href={routeUrlFor(selectedOrders)}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white shadow-sm shadow-indigo-600/25 transition active:scale-[0.98]"
            >
              <Navigation className="h-5 w-5 fill-white" />
              Seçilenlere Yol Tarifi ({selected.size} durak)
            </a>
          ) : (
            <button
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white opacity-50"
            >
              <Navigation className="h-5 w-5 fill-white" />
              Seçilenlere Yol Tarifi
            </button>
          )
        ) : (
          <button
            onClick={() => void confirmClaim()}
            disabled={selected.size === 0 || claiming}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-sm shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-50"
          >
            {claiming ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            Seçilenleri Üstlen{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        )}
      </div>
    </div>
  );
}
