"use client";

// Tek global Trendyol "yeni sipariş" izleyici.
// 15 sn'de bir `since` cursor'u ile sadece YENİ siparişleri çeker.
// Birden fazla bileşen `subscribe()` çağırabilir; ortak bir tick döner.
// İlk abone gelince poll başlar, son abone ayrılınca poll durur.

import { create } from "zustand";
import {
  getRecentTrendyolRefs,
  type RecentTrendyolRef,
} from "@/actions/orders";

const POLL_MS = 15_000;

type State = {
  // En son tick'te tespit edilmiş yeni siparişler (consumer'lar drain eder).
  freshOrders: RecentTrendyolRef[];
  // Son işlenen createdAt (ms epoch). Sunucu sorgusu bu cursor'u kullanır.
  cursor: number;
  initialized: boolean;
  consumeFresh: () => RecentTrendyolRef[];
};

export const useTrendyolWatcherStore = create<State>((set, get) => ({
  freshOrders: [],
  cursor: 0,
  initialized: false,
  consumeFresh: () => {
    const list = get().freshOrders;
    if (list.length > 0) set({ freshOrders: [] });
    return list;
  },
}));

// ─── Tekil polling kontrolü ──────────────────────────────────────────────────
let subscriberCount = 0;
let timerId: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let focusHandler: (() => void) | null = null;

async function tick() {
  if (typeof document !== "undefined" && document.hidden) return;
  if (inFlight) return;
  inFlight = true;
  try {
    const { cursor, initialized } = useTrendyolWatcherStore.getState();
    const refs = await getRecentTrendyolRefs({
      limit: 15,
      since: initialized ? cursor : undefined,
    });

    if (!initialized) {
      // İlk tick: mevcut siparişleri "görüldü" kabul et — sadece cursor'u ileri al.
      const maxTs = refs.reduce((m, r) => Math.max(m, r.createdAt), 0);
      useTrendyolWatcherStore.setState({
        cursor: maxTs,
        initialized: true,
      });
      return;
    }

    if (refs.length === 0) return;
    const maxTs = refs.reduce((m, r) => Math.max(m, r.createdAt), cursor);
    // En eski → en yeni sıraya çevir; consumer'lar doğal sıralamada işlesin.
    const fresh = [...refs].sort((a, b) => a.createdAt - b.createdAt);
    useTrendyolWatcherStore.setState((s) => ({
      freshOrders: [...s.freshOrders, ...fresh],
      cursor: maxTs,
    }));
  } catch {
    // sessiz başarısızlık — bir sonraki tick'te tekrar denenir
  } finally {
    inFlight = false;
  }
}

/**
 * Bileşen mount'unda çağır, döndürdüğü unsubscribe'ı useEffect cleanup'ında çağır.
 * İlk abone poll'u başlatır, son abone durdurur.
 */
export function subscribeTrendyolWatcher(): () => void {
  subscriberCount += 1;
  if (subscriberCount === 1 && typeof window !== "undefined") {
    void tick();
    timerId = setInterval(tick, POLL_MS);
    focusHandler = () => void tick();
    window.addEventListener("focus", focusHandler);
  }
  return () => {
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0) {
      if (timerId) clearInterval(timerId);
      timerId = null;
      if (focusHandler && typeof window !== "undefined") {
        window.removeEventListener("focus", focusHandler);
      }
      focusHandler = null;
    }
  };
}
