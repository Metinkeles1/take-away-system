"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Phone,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Navigation,
  Banknote,
  CreditCard,
  WalletCards,
  Clock,
  ShoppingBag,
  ChevronDown,
  X,
} from "lucide-react";
import { getCourierOrders } from "@/actions/courier";
import { subscribeOrders } from "@/lib/pusher/client";
import { type Order } from "@/types";
import { formatCurrency, formatRelativeTime, cn } from "@/lib/utils";

const REFRESH_MS = 20_000;

const PAYMENT_LABEL: Record<string, { label: string; icon: React.ElementType; tone: string }> = {
  cash: { label: "Nakit", icon: Banknote, tone: "text-emerald-600 bg-emerald-50" },
  card: { label: "Kart", icon: CreditCard, tone: "text-violet-600 bg-violet-50" },
  online: { label: "Online", icon: CreditCard, tone: "text-blue-600 bg-blue-50" },
  meal_card: { label: "Yemek Kartı", icon: WalletCards, tone: "text-orange-600 bg-orange-50" },
  iban: { label: "IBAN", icon: WalletCards, tone: "text-slate-600 bg-slate-100" },
};

function fullAddress(o: Order): string {
  return [o.customer.address, o.customer.addressDetail, o.customer.district]
    .filter(Boolean)
    .join(", ");
}

// "Teslim edildi" bildirimi — sade: adres — ödeme tipi — Teslim edildi.
// Numara YOK: WhatsApp'ın sohbet seçme ekranı açılır, kurye grubu seçip gönderir.
// (WhatsApp deep-link ile belirli bir gruba doğrudan mesaj atmaya izin vermez.)
function buildWhatsAppUrl(o: Order): string {
  const payLabel = PAYMENT_LABEL[o.payment.method]?.label ?? "Ödeme";
  const text = `${fullAddress(o)} — ${payLabel} — Teslim edildi`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export default function KuryePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const startX = useRef<number | null>(null);
  // Teslim anında yakalanan GPS konumu — Promise olarak tutulur. "Teslim Et"e
  // basınca yakalama başlar; "Onayla & Bildir"de bu Promise beklenir. Böylece
  // kurye onaya hemen bassa bile konum gelene kadar (kısa süre) beklenir ve pin
  // kaybolmaz. maximumAge ile yakın zamanlı bir fix varsa anında döner.
  const geoPromiseRef = useRef<Promise<{ lat: number; lng: number } | null> | null>(null);

  const captureGeo = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      geoPromiseRef.current = Promise.resolve(null);
      return;
    }
    geoPromiseRef.current = new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null), // izin yok / hata: pinsiz devam et
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  };

  const load = async () => {
    try {
      const data = await getCourierOrders();
      setOrders(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const poll = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    // Gerçek zamanlı: yeni sipariş / durum değişince anında yenile (polling yedek).
    const unsubscribe = subscribeOrders(() => void load());
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, []);

  // En eski sipariş ilk sırada (önce gelen önce teslim).
  const sorted = useMemo(
    () =>
      [...orders].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [orders],
  );

  // Aktif indeks her zaman geçerli aralıkta kalsın.
  const idx = Math.min(active, Math.max(0, sorted.length - 1));
  const current = sorted[idx];

  const go = (i: number) => {
    setConfirming(false);
    geoPromiseRef.current = null; // sipariş değişti, bekleyen konumu unut
    setActive(Math.max(0, Math.min(sorted.length - 1, i)));
  };

  // Kaydırma jesti — sola kaydır: sonraki, sağa kaydır: önceki.
  const onSwipeStart = (x: number) => (startX.current = x);
  const onSwipeEnd = (x: number) => {
    if (startX.current == null) return;
    const dx = x - startX.current;
    if (dx < -50) go(idx + 1);
    else if (dx > 50) go(idx - 1);
    startX.current = null;
  };

  // Teslim onayı: durumu güvenilir biçimde DB'ye yaz + listeden düş.
  // keepalive: "Onayla & Bildir" anchor'ı WhatsApp'ı açıp tarayıcıyı arka plana
  // atsa bile istek tamamlanır. (Eski sürümde mobilde istek yarıda kesilip
  // sipariş tekrar "teslim edilmedi" olarak geri dönebiliyordu.)
  const handleDeliver = (o: Order) => {
    setDeliveringId(o.id);
    setConfirming(false);
    setOrders((prev) => prev.filter((x) => x.id !== o.id));
    const geoPromise = geoPromiseRef.current ?? Promise.resolve(null);
    void (async () => {
      // Konum henüz gelmediyse kısa süre bekle (yarış koşulunu kapatır); en geç
      // 5 sn sonra pinsiz devam et ki teslim onayı asla takılmasın.
      const geo = await Promise.race([
        geoPromise,
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]);
      await fetch("/api/orders/deliver", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: o.id, lat: geo?.lat, lng: geo?.lng }),
        keepalive: true,
      });
    })().catch(() => {
      // Sunucuya ulaşamazsa sipariş bir sonraki yenilemede geri gelir; sessiz geç.
    });
  };

  return (
    <div className="flex h-dvh flex-col bg-linear-to-b from-slate-100 to-slate-200">
      {/* Üst başlık */}
      <header className="z-20 shrink-0 border-b border-slate-800 bg-slate-900/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-lime-500/20 text-xl">
              🛵
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight">Teslimat</h1>
              <p className="text-[11px] text-slate-400">{sorted.length} aktif paket</p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            aria-label="Yenile"
            className="rounded-full p-2.5 text-slate-300 transition hover:bg-white/10 active:scale-90"
          >
            <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      {/* Kayan içerik alanı */}
      <main
        className="mx-auto w-full max-w-md flex-1 overflow-y-auto select-none"
        onTouchStart={(e) => onSwipeStart(e.touches[0].clientX)}
        onTouchEnd={(e) => onSwipeEnd(e.changedTouches[0].clientX)}
        onMouseDown={(e) => onSwipeStart(e.clientX)}
        onMouseUp={(e) => onSwipeEnd(e.clientX)}
      >
        {loading && orders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm">Paketler yükleniyor…</p>
          </div>
        ) : sorted.length === 0 || !current ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">Teslim edilecek paket yok</p>
              <p className="text-sm text-slate-500">Tüm siparişler teslim edildi 🎉</p>
            </div>
          </div>
        ) : (
          <>
            {/* Konum göstergesi + ok ile gezinme */}
            <div className="flex items-center justify-center gap-4 px-4 py-3">
              <button
                onClick={() => go(idx - 1)}
                disabled={idx === 0}
                aria-label="Önceki"
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition active:scale-90 disabled:opacity-30"
              >
                ‹
              </button>
              <span className="text-sm font-bold text-slate-500">
                {idx + 1} / {sorted.length}
              </span>
              <button
                onClick={() => go(idx + 1)}
                disabled={idx === sorted.length - 1}
                aria-label="Sonraki"
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition active:scale-90 disabled:opacity-30"
              >
                ›
              </button>
            </div>

            <div className="px-4 pb-4">
              <OrderCard key={current.id} o={current} />
            </div>

            {/* Nokta göstergesi — dokununca o siparişe atla */}
            {sorted.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 pb-4">
                {sorted.map((o, i) => (
                  <button
                    key={o.id}
                    onClick={() => go(i)}
                    aria-label={`Sipariş ${i + 1}`}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      i === idx ? "w-6 bg-slate-900" : "w-2 bg-slate-300",
                    )}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Sabit alt aksiyon barı — sadece teslim edilecek paket varken */}
      {current && (
        <footer className="z-20 shrink-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-md items-stretch gap-2.5 p-3">
            {!confirming ? (
              <>
                <a
                  href={`tel:${current.customer.phone}`}
                  aria-label="Müşteriyi ara"
                  className="flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/25 transition active:scale-95"
                >
                  <Phone className="h-5 w-5" />
                  <span className="text-xs font-semibold">Ara</span>
                </a>
                <button
                  onClick={() => {
                    captureGeo(); // konum iznini iste + erken yakala
                    setConfirming(true);
                  }}
                  disabled={deliveringId === current.id}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-sm shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-60"
                >
                  {deliveringId === current.id ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" /> Teslim Et
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setConfirming(false)}
                  aria-label="Vazgeç"
                  className="flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-slate-100 text-slate-600 transition active:scale-95"
                >
                  <X className="h-5 w-5" />
                  <span className="text-xs font-semibold">Vazgeç</span>
                </button>
                {/* Anchor: tıklamada durum güncellenir + WhatsApp sohbet seçimi açılır */}
                <a
                  href={buildWhatsAppUrl(current)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => handleDeliver(current)}
                  className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl bg-emerald-600 py-3 text-white shadow-sm shadow-emerald-600/25 transition active:scale-[0.98]"
                >
                  <span className="flex items-center gap-2 text-base font-bold">
                    <CheckCircle2 className="h-5 w-5" /> Onayla & Bildir
                  </span>
                  <span className="text-[11px] font-medium text-emerald-100">
                    WhatsApp'ta teslimat grubunu seç
                  </span>
                </a>
              </>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

// ─── Tek sipariş kartı ───────────────────────────────────────────────────────
function OrderCard({ o }: { o: Order }) {
  const [itemsOpen, setItemsOpen] = useState(false);
  const pay = PAYMENT_LABEL[o.payment.method];
  const itemCount = o.items.reduce((s, i) => s + i.quantity, 0);
  // Pinlenmiş konum varsa kesin koordinata git; yoksa metin adresini geocode et.
  const hasPin = !!o.customer.geo;
  const mapsUrl = hasPin
    ? `https://www.google.com/maps/search/?api=1&query=${o.customer.geo!.lat},${o.customer.geo!.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(o))}`;
  const detail = [o.customer.addressDetail, o.customer.district].filter(Boolean).join(" · ");

  return (
    <article className="w-full overflow-hidden rounded-3xl bg-white shadow-lg shadow-slate-300/40 ring-1 ring-slate-200">
      {/* Başlık şeridi — sipariş no + ödeme rozeti + süre */}
      <div className="flex items-center gap-3 bg-slate-900 px-5 py-3 text-white">
        <span className="flex items-center gap-2 text-lg font-bold">
          <span className="h-5 w-1 rounded-full bg-lime-400" />#{o.orderNumber}
        </span>
        {pay && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-xs font-semibold text-white">
            <pay.icon className="h-3.5 w-3.5" />
            {pay.label}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" /> {formatRelativeTime(o.createdAt)}
        </span>
      </div>

      {/* Adres — kartın kahramanı */}
      <div className="px-5 pt-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-50 ring-1 ring-rose-100">
            <MapPin className="h-6 w-6 text-rose-500" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xl leading-tight font-extrabold tracking-tight text-slate-900">
              {o.customer.address}
            </p>
            {detail && <p className="mt-1 text-sm font-medium text-slate-500">{detail}</p>}
            {hasPin && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                <MapPin className="h-3 w-3" /> Konum pinli
              </span>
            )}
          </div>
        </div>

        {/* Yol tarifi — büyük, kaçırılması imkânsız birincil aksiyon */}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-sm shadow-blue-600/25 transition active:scale-[0.98]"
        >
          <Navigation className="h-5 w-5 fill-white" /> Yol Tarifi Al
        </a>
      </div>

      {/* Müşteri + tutar */}
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            Müşteri
          </p>
          <p className="truncate text-base font-bold text-slate-900">{o.customer.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            Tahsilat
          </p>
          <p className="text-2xl leading-none font-extrabold tracking-tight text-slate-900">
            {formatCurrency(o.total)}
          </p>
        </div>
      </div>

      {/* Sipariş içeriği — açılır-kapanır (accordion); varsayılan kapalı */}
      <div className="border-t border-slate-100 bg-slate-50/60">
        <button
          onClick={() => setItemsOpen((v) => !v)}
          aria-expanded={itemsOpen}
          className="flex w-full items-center gap-2 px-5 py-3 text-left transition active:bg-slate-100"
        >
          <ShoppingBag className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-bold text-slate-700">{itemCount} Ürün</span>
          <span className="text-xs font-medium text-slate-400">
            {itemsOpen ? "gizle" : "detayı gör"}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto h-5 w-5 text-slate-400 transition-transform",
              itemsOpen && "rotate-180",
            )}
          />
        </button>
        {itemsOpen && (
          <ul className="space-y-1.5 px-5 pb-3">
            {o.items.map((item, i) => (
              <li
                key={`${o.id}-${i}`}
                className="flex items-start gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100"
              >
                <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                  {item.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {item.product.name}
                    {item.portion && (
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        ({item.portion.label})
                      </span>
                    )}
                  </p>
                  {item.note && (
                    <p className="mt-0.5 text-xs font-medium text-amber-700">↳ {item.note}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-500">
                  {formatCurrency(item.totalPrice)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sipariş notu */}
      {o.notes && (
        <div className="flex items-start gap-2 border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-900">
          <span className="shrink-0">📝</span>
          <span>{o.notes}</span>
        </div>
      )}
    </article>
  );
}
