"use client";

import { useEffect } from "react";
import { useOrderStore } from "@/store/orderStore";
import { subscribeOrders } from "@/lib/pusher/client";

// Pusher yedeği — periyodik sessiz yenileme aralığı (kurye sayfasıyla aynı).
const REFRESH_MS = 20_000;

// Siparişler listesini canlı tutar: ilk yükleme + Pusher (anlık) + polling yedeği
// + sekme focus. Asıl mekanizma Pusher; polling yalnızca Pusher env yoksa ya da
// bir mesaj kaçarsa nihai tutarlılık içindir. Sekme gizliyken boşa istek atmaz.
//
// onReady: ilk yükleme bitince çağrılır (bootstrap skeleton'ı kapatmak için).
// Store action'ları (loadOrders) sabit referanslı olduğundan efekt yalnızca
// mount'ta bir kez kurulur; getState() ile her zaman güncel action'a erişilir.
export function useOrdersSync(onReady?: () => void) {
  useEffect(() => {
    const { loadOrders } = useOrderStore.getState();
    loadOrders().finally(() => onReady?.());

    const refresh = () =>
      void useOrderStore.getState().loadOrders({ silent: true });

    const poll = setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeOrders(refresh);

    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
