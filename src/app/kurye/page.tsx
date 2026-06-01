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
} from "lucide-react";
import { getCourierOrders } from "@/actions/courier";
import { subscribeOrders } from "@/lib/pusher/client";
import { type Order } from "@/types";
import { formatCurrency, formatRelativeTime, cn } from "@/lib/utils";

const REFRESH_MS = 20_000;

// Yöneticinin WhatsApp numarası (uluslararası, + olmadan): örn. 905321234567
const ADMIN_WA = (process.env.NEXT_PUBLIC_ADMIN_WHATSAPP ?? "").replace(/\D/g, "");

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
function buildWhatsAppUrl(o: Order): string | null {
  if (!ADMIN_WA) return null;
  const payLabel = PAYMENT_LABEL[o.payment.method]?.label ?? "Ödeme";
  const text = `${fullAddress(o)} — ${payLabel} — Teslim edildi`;
  return `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(text)}`;
}

export default function KuryePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const startX = useRef<number | null>(null);

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
    void fetch("/api/orders/deliver", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: o.id }),
      keepalive: true,
    }).catch(() => {
      // Sunucuya ulaşamazsa sipariş bir sonraki yenilemede geri gelir; sessiz geç.
    });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-linear-to-b from-slate-100 to-slate-200">
      {/* Üst başlık */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 text-white backdrop-blur">
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

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {loading && orders.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm">Paketler yükleniyor…</p>
          </div>
        ) : sorted.length === 0 || !current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
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
            {/* Konum göstergesi */}
            <div className="px-4 py-3 text-center">
              <span className="text-sm font-bold text-slate-500">
                {idx + 1} / {sorted.length}
              </span>
              {sorted.length > 1 && (
                <p className="text-xs text-slate-400">← kaydırarak geç →</p>
              )}
            </div>

            {/* Kaydırılabilir kart */}
            <div
              className="flex flex-1 items-start px-4 pb-4 select-none"
              onTouchStart={(e) => onSwipeStart(e.touches[0].clientX)}
              onTouchEnd={(e) => onSwipeEnd(e.changedTouches[0].clientX)}
              onMouseDown={(e) => onSwipeStart(e.clientX)}
              onMouseUp={(e) => onSwipeEnd(e.clientX)}
            >
              <OrderCard
                o={current}
                confirming={confirming}
                delivering={deliveringId === current.id}
                onConfirm={() => setConfirming(true)}
                onCancel={() => setConfirming(false)}
                onDeliver={() => handleDeliver(current)}
                waUrl={buildWhatsAppUrl(current)}
              />
            </div>

            {/* Nokta göstergesi — dokununca o siparişe atla */}
            {sorted.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 py-3">
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
    </div>
  );
}

// ─── Tek sipariş kartı ───────────────────────────────────────────────────────
function OrderCard({
  o,
  confirming,
  delivering,
  onConfirm,
  onCancel,
  onDeliver,
  waUrl,
}: {
  o: Order;
  confirming: boolean;
  delivering: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDeliver: () => void;
  waUrl: string | null;
}) {
  const pay = PAYMENT_LABEL[o.payment.method];
  const itemCount = o.items.reduce((s, i) => s + i.quantity, 0);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    fullAddress(o),
  )}`;

  return (
    <article className="w-full overflow-hidden rounded-3xl bg-white shadow-lg shadow-slate-300/40 ring-1 ring-slate-200">
      {/* Başlık şeridi */}
      <div className="flex items-center justify-between bg-slate-900 px-5 py-3 text-white">
        <span className="text-lg font-bold">#{o.orderNumber}</span>
        <span className="inline-flex items-center gap-1 text-xs text-slate-300">
          <Clock className="h-3.5 w-3.5" /> {formatRelativeTime(o.createdAt)}
        </span>
      </div>

      {/* Adres — en belirgin, dokununca harita */}
      <a
        href={mapsUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-start gap-3 px-5 py-4 transition active:bg-slate-50"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50">
          <MapPin className="h-5 w-5 text-rose-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-snug text-slate-900">
            {o.customer.address}
          </p>
          {(o.customer.addressDetail || o.customer.district) && (
            <p className="mt-0.5 text-sm text-slate-500">
              {[o.customer.addressDetail, o.customer.district].filter(Boolean).join(" · ")}
            </p>
          )}
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
            <Navigation className="h-3.5 w-3.5" /> Yol tarifi
          </span>
        </div>
      </a>

      {/* Müşteri + ödeme + ara */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{o.customer.name}</p>
          <div className="mt-1 flex items-center gap-2">
            {pay && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold",
                  pay.tone,
                )}
              >
                <pay.icon className="h-3.5 w-3.5" />
                {pay.label}
              </span>
            )}
            <span className="font-bold text-slate-900">{formatCurrency(o.total)}</span>
          </div>
        </div>
        <a
          href={`tel:${o.customer.phone}`}
          aria-label="Müşteriyi ara"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-white shadow-sm active:scale-95"
        >
          <Phone className="h-5 w-5" />
        </a>
      </div>

      {/* Sipariş içeriği */}
      <div className="border-t border-slate-100 px-5 py-2.5">
        <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
          <ShoppingBag className="h-3.5 w-3.5" /> {itemCount} ürün
        </p>
        <ul className="divide-y divide-slate-100">
          {o.items.map((item, i) => (
            <li key={`${o.id}-${i}`} className="flex items-start gap-3 py-2">
              <span className="mt-0.5 grid min-w-7 shrink-0 place-items-center rounded-md bg-white px-1.5 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                {item.quantity}×
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {item.product.name}
                  {item.portion && (
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      ({item.portion.label})
                    </span>
                  )}
                </p>
                {item.note && <p className="text-xs text-amber-700">↳ {item.note}</p>}
              </div>
              <span className="shrink-0 text-sm text-slate-500">
                {formatCurrency(item.totalPrice)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Sipariş notu */}
      {o.notes && (
        <p className="bg-amber-50 px-5 py-2.5 text-sm text-amber-900">📝 {o.notes}</p>
      )}

      {/* Teslim et — iki adımlı onay */}
      <div className="border-t border-slate-100 p-4">
        {!confirming ? (
          <button
            onClick={onConfirm}
            disabled={delivering}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow-sm shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-60"
          >
            {delivering ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" /> Teslim Et
              </>
            )}
          </button>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 rounded-xl bg-slate-100 py-3.5 text-sm font-semibold text-slate-600 active:scale-[0.98]"
              >
                Vazgeç
              </button>
              {/* Anchor: tıklamada durum güncellenir + WhatsApp açılır */}
              <a
                href={waUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                onClick={onDeliver}
                className="flex flex-2 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white active:scale-[0.98]"
              >
                <CheckCircle2 className="h-5 w-5" /> Onayla & Bildir
              </a>
            </div>
            {!waUrl && (
              <p className="mt-2 text-center text-[11px] text-rose-500">
                WhatsApp numarası tanımlı değil — sadece teslim edildi olarak işaretlenecek.
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
