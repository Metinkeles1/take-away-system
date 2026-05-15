"use client";

// Leaflet'i sadece client-side yükle. SSR sırasında window referansı yok.

import { useEffect, useRef } from "react";
import type { RegionPin } from "@/actions/trendyolRegions";
import "leaflet/dist/leaflet.css";

const STATUS_COLORS: Record<string, string> = {
  Created: "#3b82f6",
  Picking: "#f59e0b",
  Invoiced: "#8b5cf6",
  Shipped: "#f97316",
  Delivered: "#10b981",
};

export function RegionsMap({
  pins,
  bounds,
  height = 480,
}: {
  pins: RegionPin[];
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([41.0082, 28.9784], 11); // İstanbul default
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        mapRef.current = map;
      }

      const map = mapRef.current;

      // Eski layer'ı temizle
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }

      if (pins.length === 0) return;

      const group = L.layerGroup();
      for (const pin of pins) {
        const color = STATUS_COLORS[pin.status] ?? "#6b7280";
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: 7,
          fillColor: color,
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        });
        const datestr = new Date(pin.createdAt).toLocaleString("tr-TR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        marker.bindPopup(
          `<div style="font-size:12px;line-height:1.4">
            <div style="font-weight:600;margin-bottom:4px">#${escapeHtml(pin.orderNumber)}</div>
            <div>${escapeHtml(pin.neighborhood ?? pin.district ?? "—")}</div>
            <div style="color:#059669;font-weight:600;margin-top:2px">${pin.total.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</div>
            <div style="color:#6b7280;font-size:11px;margin-top:2px">${datestr}</div>
          </div>`,
        );
        marker.addTo(group);
      }
      group.addTo(map);
      layerRef.current = group;

      if (bounds) {
        map.fitBounds(
          [
            [bounds.minLat, bounds.minLng],
            [bounds.maxLat, bounds.maxLng],
          ],
          { padding: [30, 30], maxZoom: 14 },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pins, bounds]);

  // Component unmount'unda haritayı yok et
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden border bg-gray-100"
      style={{ height }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
