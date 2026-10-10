"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Share, SquarePlus, UserRound, X } from "lucide-react";
import { removePushSubscription, savePushSubscription } from "@/actions/courierPush";
import { cn } from "@/lib/utils";

// Kurye çağır bildirimi — kurye tarafı. Telefon bir kez "Bildirimleri aç" der,
// abonelik sunucuya kurye adıyla yazılır; panel "Kurye Çağır" deyince ekran
// kilitliyken de sistem bildirimi düşer (bkz. public/sw.js "push").
//
// Durumlar:
//  • unsupported  — tarayıcı desteklemiyor (veya geliştirme ortamı: SW yok)
//  • ios-install  — iPhone'da Safari sekmesi: önce "Ana Ekrana Ekle" gerekli
//  • denied       — kurye izni reddetmiş, telefon ayarlarından açılmalı
//  • off / on     — normal

export type PushState = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const DISMISS_KEY = "kurye:bildirim-uyari-gizle";
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function base64ToUint8(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// SW production'da sayfa yüklenince kaydolur; hazır olmasını kısa süre bekle.
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 5000)),
  ]);
}

function toInput(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  };
}

export interface CourierCall {
  title: string;
  body: string;
  at: number;
}

export function useCourierPush(courier: string | null) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<CourierCall | null>(null);

  // Mevcut durumu oku; açıksa aboneliği bu kurye adıyla tazele (cihaz başka
  // kuryeye geçtiyse kayıt taşınır, eski kayıt da canlı kalır).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        if (!cancelled) setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (!VAPID_PUBLIC) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await getRegistration();
      if (!reg) {
        if (!cancelled) setState("unsupported");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (cancelled) return;
      if (sub && Notification.permission === "granted") {
        setState("on");
        if (courier) void savePushSubscription(courier, toInput(sub), navigator.userAgent);
      } else {
        setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courier]);

  // Ekran açıkken gelen çağrı → büyük uyarı + titreşim (sistem bildirimine ek).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string } & Partial<CourierCall>;
      if (d?.type !== "courier-call") return;
      setCall({ title: d.title ?? "Kurye çağrısı", body: d.body ?? "", at: d.at ?? Date.now() });
      navigator.vibrate?.([400, 150, 400, 150, 800]);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  const enable = useCallback(async () => {
    if (!courier) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        return;
      }
      if (permission !== "granted") return; // kurye pencereyi kapattı
      const reg = await getRegistration();
      if (!reg) {
        setError("Bildirim servisi hazır değil, sayfayı yenileyip tekrar dene");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8(VAPID_PUBLIC),
        }));
      const res = await savePushSubscription(courier, toInput(sub), navigator.userAgent);
      if (!res.ok) {
        setError(res.error ?? "Kayıt yapılamadı");
        return;
      }
      setState("on");
    } catch (err) {
      console.error("[useCourierPush.enable]", err);
      setError("Bildirimler açılamadı");
    } finally {
      setBusy(false);
    }
  }, [courier]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err) {
      console.error("[useCourierPush.disable]", err);
      setError("Bildirimler kapatılamadı");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, call, dismissCall: () => setCall(null), enable, disable };
}

type Push = ReturnType<typeof useCourierPush>;

// Bildirim "kapalı" ve kurye bir şey yapabilir durumda mı (profil rozetindeki
// kırmızı nokta için).
export function pushNeedsAttention(push: Push): boolean {
  return push.state === "off" || push.state === "ios-install" || push.state === "denied";
}

// Başlığın altındaki hatırlatma — bildirim kapalıyken. "Sonra" bugünlük gizler.
export function PushBanner({ push, onOpen }: { push: Push; onOpen: () => void }) {
  // İlk render'da push.state "loading" olduğu için banner zaten çizilmez;
  // localStorage'ı başlangıçta okumak hydration'ı bozmaz.
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === new Date().toDateString();
    } catch {
      return false;
    }
  });

  if (hidden || !["off", "ios-install", "denied"].includes(push.state)) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toDateString());
    } catch {
      // sessiz geç
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-3 pt-3">
      <div className="flex items-center gap-3 rounded-2xl bg-slate-900 p-3 text-white shadow-lg">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lime-500/20 text-lime-300">
          <Bell className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">Çağrıları kaçırma</p>
          <p className="text-xs text-slate-400">Paketler hazır olunca telefonun titresin</p>
        </div>
        <button
          onClick={onOpen}
          className="shrink-0 rounded-xl bg-lime-400 px-3 py-2 text-sm font-bold text-slate-900 transition active:scale-95"
        >
          Aç
        </button>
        <button onClick={hide} aria-label="Sonra" className="shrink-0 rounded-full p-1.5 text-slate-500 active:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Profil sheet'i — kurye adına dokununca açılır: bildirim aç/kapat (Ayarlar'dan
// kurye çağır açıksa) + kuryeyi değiştir. Başlıkta ayrı zil butonu yok.
export function CourierProfileSheet({
  push,
  courier,
  callEnabled,
  open,
  onClose,
  onChangeCourier,
}: {
  push: Push;
  courier: string | null;
  callEnabled: boolean;
  open: boolean;
  onClose: () => void;
  onChangeCourier: () => void;
}) {
  if (!open) return null;
  const showPush = callEnabled && push.state !== "loading" && push.state !== "unsupported";
  const on = push.state === "on";
  const canToggle = push.state === "on" || push.state === "off";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-slate-200" />

        {/* Kimlik */}
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-slate-900 text-lg font-bold text-lime-300">
            {courier ? courier.slice(0, 2).toUpperCase() : "🛵"}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Kurye</p>
            <h2 className="truncate text-xl font-bold text-slate-900">{courier ?? "—"}</h2>
          </div>
        </div>

        {/* Bildirimler */}
        {showPush && (
          <div className="mb-3 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                  on ? "bg-lime-100 text-lime-700" : "bg-slate-100 text-slate-500",
                )}
              >
                {on ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-tight text-slate-900">Çağrı bildirimi</p>
                <p className="text-xs text-slate-500">
                  {on ? "Açık · panel çağırınca telefonun titrer" : "Kapalı · çağrılar gelmez"}
                </p>
              </div>
              {canToggle && (
                <button
                  role="switch"
                  aria-checked={on}
                  aria-label="Çağrı bildirimi"
                  disabled={push.busy}
                  onClick={() => void (on ? push.disable() : push.enable())}
                  className={cn(
                    "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
                    on ? "bg-lime-500" : "bg-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-transform",
                      on ? "translate-x-7" : "translate-x-1",
                    )}
                  >
                    {push.busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                  </span>
                </button>
              )}
            </div>

            {push.state === "ios-install" && (
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p>iPhone&apos;da bildirim için bu sayfayı önce uygulama olarak ekle:</p>
                <ol className="space-y-2">
                  <li className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">1</span>
                    <span className="flex flex-wrap items-center gap-1">
                      Safari&apos;de alttaki <Share className="inline h-4 w-4" /> <b>Paylaş</b>&apos;a dokun
                    </span>
                  </li>
                  <li className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">2</span>
                    <span className="flex flex-wrap items-center gap-1">
                      <SquarePlus className="inline h-4 w-4" /> <b>Ana Ekrana Ekle</b>&apos;yi seç
                    </span>
                  </li>
                  <li className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">3</span>
                    <span>Ana ekrandaki <b>Kurye</b> uygulamasını aç, bildirimi buradan aç</span>
                  </li>
                </ol>
                <p className="text-xs text-slate-400">iOS 16.4 veya üstü gerekir.</p>
              </div>
            )}

            {push.state === "denied" && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                Bildirim izni engellenmiş. Telefon ayarlarından bu uygulama (veya tarayıcı) için{" "}
                <b>Bildirimler</b>&apos;e izin ver, sonra sayfayı yenile.
              </p>
            )}

            {push.error && (
              <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">{push.error}</p>
            )}
          </div>
        )}

        <button
          onClick={() => {
            onClose();
            onChangeCourier();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 py-4 text-base font-bold text-slate-700 transition active:scale-[0.98]"
        >
          <UserRound className="h-5 w-5" />
          Kuryeyi değiştir
        </button>
        <button onClick={onClose} className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold text-slate-500 active:bg-slate-50">
          Kapat
        </button>
      </div>
    </div>
  );
}

// Ekran açıkken gelen çağrı — tam ekran, gözden kaçmaz.
export function CourierCallOverlay({ push }: { push: Push }) {
  if (!push.call) return null;
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-in zoom-in-95 rounded-3xl bg-lime-400 p-6 text-center text-slate-900 shadow-2xl">
        <div className="mx-auto mb-4 grid h-20 w-20 animate-bounce place-items-center rounded-full bg-slate-900 text-4xl">
          🛵
        </div>
        <h2 className="text-2xl font-black">{push.call.title.replace(/^🛵\s*/, "")}</h2>
        <p className="mt-2 text-lg font-semibold">{push.call.body}</p>
        <button
          onClick={push.dismissCall}
          className="mt-6 w-full rounded-2xl bg-slate-900 py-4 text-lg font-bold text-white transition active:scale-[0.98]"
        >
          Tamam, geliyorum
        </button>
      </div>
    </div>
  );
}
