"use client";

import { useEffect } from "react";

// Service worker'ı tarayıcıda kaydeder. Chrome'un "Uygulamayı yükle" banner'ı için
// aktif bir SW (fetch handler'lı) gerekir; manifest tek başına bazı sürümlerde yetmez.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Geliştirmede: önceki prod/Vercel oturumlarından kalmış aktif bir SW,
    // dev'de gezinmeleri bozup kullanıcıyı yanlış/önceki sayfaya atabiliyor
    // (SW tarayıcıda kalıcıdır). Bu yüzden dev'de mevcut SW'leri ve cache'leri
    // temizle, yeni SW kaydetme.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => void r.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker kaydı başarısız:", err);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
