"use client";

// Global Trendyol sipariş bildiricisi.
// Her sayfada AppShell altında çalışır. 15 sn'de bir poll yapar; yeni
// Trendyol siparişi tespit ederse:
//   1) iki tonlu "ding" sesi çalar (autoplay unlock'tan sonra)
//   2) toast gösterir
//
// Tarayıcı autoplay politikası: AudioContext kullanıcı etkileşimi
// olmadan çalmaz. Sayfa açıldıktan sonraki ilk tıklamada AudioContext'i
// hazırlıyoruz — sonrasında programatik olarak ses çalabiliyoruz.

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getRecentTrendyolRefs } from "@/actions/orders";

const POLL_MS = 15_000;

// Modül-seviyesi tek AudioContext — birden fazla mount/unmount olsa bile
// state korunsun. Browser policy gereği user gesture'dan sonra resume edilir.
let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    audioCtx = new AudioCtx();
    return audioCtx;
  } catch {
    return null;
  }
}

function unlockAudio() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  // Sessiz bir buffer çalarak context'i "running" duruma getir
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  audioUnlocked = true;
}

// Tek "ding-dong" — fresh AudioContext zamanlamasıyla çalar.
function playSingleDing() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const now = ctx.currentTime;
  const notes = [
    { freq: 988, dur: 0.22, start: 0 }, // B5
    { freq: 1319, dur: 0.45, start: 0.22 }, // E6 (uzun vurgu)
  ];

  for (const n of notes) {
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = n.freq;

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = n.freq * 2;

    const gain = ctx.createGain();
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    const startAt = now + n.start;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.6, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + n.dur);

    osc1.start(startAt);
    osc1.stop(startAt + n.dur + 0.02);
    osc2.start(startAt);
    osc2.stop(startAt + n.dur + 0.02);
  }
}

// Uzun bildirim — ding'i setTimeout ile tekrar tekrar tetikler.
// Her tekrar fresh bir AudioContext döngüsünde çalar, tarayıcı düşürmez.
// 8 tekrar × ~0.7sn ding + 0.4sn boşluk = ~9 saniye.
function playTrendyolDing() {
  const REPEATS = 8;
  const INTERVAL_MS = 1100; // her ding arası
  for (let i = 0; i < REPEATS; i++) {
    setTimeout(playSingleDing, i * INTERVAL_MS);
  }
}

export function TrendyolNotifier() {
  const seenRefsRef = useRef<Set<string> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // İlk yüklemede AudioContext'i kullanıcı tıklamasına bağla
    if (!audioUnlocked) {
      const onUserGesture = () => {
        unlockAudio();
        window.removeEventListener("pointerdown", onUserGesture);
        window.removeEventListener("keydown", onUserGesture);
      };
      window.addEventListener("pointerdown", onUserGesture, { once: false });
      window.addEventListener("keydown", onUserGesture, { once: false });
    }

    let cancelled = false;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const refs = await getRecentTrendyolRefs(15);
        if (cancelled) return;

        if (!initializedRef.current) {
          // İlk çağrıda mevcut siparişleri "görüldü" kabul et — eski siparişler
          // sayfa açılınca toast yağdırmasın.
          seenRefsRef.current = new Set(refs.map((r) => r.externalRef));
          initializedRef.current = true;
          return;
        }

        const seen = seenRefsRef.current!;
        const fresh = refs.filter((r) => !seen.has(r.externalRef));
        if (fresh.length === 0) return;

        fresh.forEach((r) => seen.add(r.externalRef));

        // Ses + toast
        playTrendyolDing();
        const first = fresh[0];
        toast.success(
          fresh.length === 1
            ? `🛵 Trendyol siparişi: #${first.orderNumber} — ${first.customerName}`
            : `🛵 ${fresh.length} yeni Trendyol siparişi geldi`,
          {
            duration: 6000,
            className:
              "!bg-emerald-600 !text-white !border-emerald-700 [&_*]:!text-white",
          },
        );
      } catch {
        // sessiz başarısızlık
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
