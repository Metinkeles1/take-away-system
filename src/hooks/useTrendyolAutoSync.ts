"use client";

import { useEffect } from "react";

// Sunucu Trendyol'a en fazla 2 dakikada bir gider (bkz. autoSyncTrendyolCourierPackages);
// ekranlar dakikada bir sorar ki her tur kaçmadan yakalansın.
const TICK_MS = 60_000;

// Ekran açık ve görünürken Trendyol siparişlerini otomatik çeker. Değişiklik
// olursa sunucu Pusher yayar, ekranlar zaten dinlediği için listeyi tazeler.
// Arka plandaki sekme / kilitli telefon istek atmaz; görünür olunca hemen sorar.
export function useTrendyolAutoSync(): void {
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/trendyol/auto-sync", { method: "POST", cache: "no-store" }).catch(
        () => {},
      );
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
}
