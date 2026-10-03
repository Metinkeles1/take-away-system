"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPanelSummary, type PanelSummary } from "@/actions/panel";
import { getCourierCash, type CourierCashState } from "@/actions/courierCash";
import { subscribeOrders } from "@/lib/pusher/client";
import type { Order } from "@/types";

// Panelin veri kaynağı: canlı liste (siparişler + kuryedeki para) ve özet
// (adetler, saatlik, teslim hızı). İkisi de Pusher olayında tazelenir; olay
// kaçarsa diye liste 30 sn'de, özet 60 sn'de bir yeniden çekilir.
const BOARD_MS = 30_000;
const SUMMARY_MS = 60_000;

export interface PanelBoard {
  orders: Order[];
  trendyolOrders: Order[];
  multiCourierMode: boolean;
}

export function usePanelData() {
  const [board, setBoard] = useState<PanelBoard | null>(null);
  const [summary, setSummary] = useState<PanelSummary | null>(null);
  const [cash, setCash] = useState<CourierCashState | null>(null);
  const [live, setLive] = useState(true);
  const summaryBusy = useRef(false);

  // Liste ve kuryedeki para birbirinden bağımsız çekilir: biri başarısız olsa
  // da diğeri güncellenir. "Bağlantı yok" yalnız liste gelmezse gösterilir.
  const loadBoard = useCallback(async () => {
    const [board, cashState] = await Promise.allSettled([
      fetch("/api/courier/board", { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<PanelBoard>;
      }),
      getCourierCash(),
    ]);
    if (board.status === "fulfilled") setBoard(board.value);
    if (cashState.status === "fulfilled") setCash(cashState.value);
    setLive(board.status === "fulfilled"); // gelmezse son veri ekranda kalır
  }, []);

  const loadSummary = useCallback(async () => {
    if (summaryBusy.current) return;
    summaryBusy.current = true;
    try {
      const s = await getPanelSummary();
      setSummary(s);
      setCash(s.cash);
    } catch {
      // özet gelmezse kartlar eski değerde kalır
    } finally {
      summaryBusy.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadBoard(), loadSummary()]);
  }, [loadBoard, loadSummary]);

  useEffect(() => {
    void loadBoard();
    void loadSummary();
    const unsubscribe = subscribeOrders(() => {
      void loadBoard();
      void loadSummary();
    });
    const b = setInterval(() => void loadBoard(), BOARD_MS);
    const s = setInterval(() => void loadSummary(), SUMMARY_MS);
    const onFocus = () => void loadBoard();
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribe();
      clearInterval(b);
      clearInterval(s);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadBoard, loadSummary]);

  return { board, summary, cash, live, loadBoard, loadSummary, refresh, setBoard };
}

// Süre sayaçları için ortak "şimdi" — 30 sn'de bir tıklar. Sunucuda 0 döner:
// sunucu UTC'de çalışır, saat/tarih orada çizilirse tarayıcıdaki (İstanbul)
// çıktıyla uyuşmaz. Zamana bağlı her şey yalnız tarayıcıda (now > 0) çizilir.
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    queueMicrotask(tick);
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
