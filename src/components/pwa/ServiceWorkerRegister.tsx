"use client";

import { useEffect } from "react";

// Service worker'ı tarayıcıda kaydeder. Chrome'un "Uygulamayı yükle" banner'ı için
// aktif bir SW (fetch handler'lı) gerekir; manifest tek başına bazı sürümlerde yetmez.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

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
