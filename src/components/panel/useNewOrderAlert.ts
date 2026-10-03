"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Order } from "@/types";

// Yeni sipariş uyarısı: panel dükkânda açık dururken yeni sipariş düşünce
// kısa bir "ding" çalar ve kart birkaç dakika "Yeni" olarak işaretlenir.
// İlk yüklemedeki siparişler yeni sayılmaz. Ses tercihi cihazda saklanır.
// Tarayıcılar sayfayla etkileşim olmadan ses çalmaya izin vermez — ses
// düğmesine bir kez basmak bunu açar.

const KEY = "panel.sound";
export const NEW_MS = 3 * 60_000;

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

let ctx: AudioContext | null = null;
function ding() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    // İki tonlu kısa zil (Mi → La).
    [659.25, 880].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t + i * 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch {
    // ses desteklenmiyorsa sessizce geç
  }
}

export function useNewOrderAlert(orders: Order[] | null) {
  const [sound, setSound] = useState(true);
  const [fresh, setFresh] = useState<Map<string, number>>(new Map());
  const seen = useRef<Set<string> | null>(null);

  // Tercih yalnız tarayıcıda okunur (sunucuda localStorage yok).
  useEffect(() => {
    const pref = readPref();
    if (!pref) queueMicrotask(() => setSound(false));
  }, []);

  useEffect(() => {
    if (!orders) return;
    const ids = orders.map((o) => o.id);
    if (seen.current === null) {
      seen.current = new Set(ids); // ilk yükleme: hiçbiri yeni değil
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    ids.forEach((id) => seen.current!.add(id));
    if (added.length === 0) return;
    const at = Date.now();
    queueMicrotask(() =>
      setFresh((m) => {
        const next = new Map(m);
        added.forEach((id) => next.set(id, at));
        return next;
      }),
    );
    if (sound) ding();
  }, [orders, sound]);

  const toggleSound = useCallback(() => {
    setSound((on) => {
      const next = !on;
      try {
        localStorage.setItem(KEY, next ? "on" : "off");
      } catch {
        // tercih saklanamazsa yalnız bu oturumda geçerli
      }
      if (next) ding(); // açarken çal: hem dener hem tarayıcının ses iznini açar
      return next;
    });
  }, []);

  const isNew = useCallback((id: string, now: number) => {
    const at = fresh.get(id);
    return at !== undefined && now - at < NEW_MS;
  }, [fresh]);

  return { sound, toggleSound, isNew };
}
