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
  LocateFixed,
  AlertTriangle,
  Check,
  Package,
  ListChecks,
  Lock,
  UserRound,
  ChevronRight,
} from "lucide-react";
import {
  getCourierBoard,
  saveDeliveryLocation,
  claimOrder,
  unclaimOrder,
  claimManyOrders,
} from "@/actions/courier";
import { getActiveCouriers, type Courier } from "@/actions/couriers";
import { setOrderPaymentMethod } from "@/actions/orders";
import { subscribeOrders } from "@/lib/pusher/client";
import {
  type Order,
  type GeoPoint,
  type PaymentMethod,
  type MealCardBrand,
  type CustomerOpenAccounts,
} from "@/types";
import { formatCurrency, formatRelativeTime, cn } from "@/lib/utils";
import { LocationPicker, type LatLng } from "@/components/kurye/LocationPicker";

// Pusher (websocket) anlık güncellemeyi sağlar; bu poll yalnızca emniyet ağı
// (Pusher devre dışıysa / kaçan olay için). Bu yüzden seyrek tutulur.
const REFRESH_MS = 60_000;

// Kurye adının cihazda saklandığı anahtar — login yok, kurye uygulamayı ilk
// açışında listeden adını seçer, sonra hatırlanır ("değiştir" ile sıfırlanır).
const COURIER_KEY = "kurye:isim";

// Harita hiç GPS/kayıtlı pin yokken bu noktaya ortalanır (kurye oradan kaydırır).
// NEXT_PUBLIC_DEFAULT_LAT/LNG ile bölgene göre ayarlanabilir; varsayılan İstanbul.
const DEFAULT_MAP_CENTER: LatLng = {
  lat: Number(process.env.NEXT_PUBLIC_DEFAULT_LAT) || 41.0082,
  lng: Number(process.env.NEXT_PUBLIC_DEFAULT_LNG) || 28.9784,
};

const PAYMENT_LABEL: Record<
  string,
  { label: string; icon: React.ElementType; tone: string }
> = {
  cash: {
    label: "Nakit",
    icon: Banknote,
    tone: "text-emerald-600 bg-emerald-50",
  },
  card: {
    label: "Kart",
    icon: CreditCard,
    tone: "text-violet-600 bg-violet-50",
  },
  online: {
    label: "Online",
    icon: CreditCard,
    tone: "text-blue-600 bg-blue-50",
  },
  meal_card: {
    label: "Yemek Kartı",
    icon: WalletCards,
    tone: "text-orange-600 bg-orange-50",
  },
  iban: {
    label: "IBAN",
    icon: WalletCards,
    tone: "text-slate-600 bg-slate-100",
  },
};

// Kurye kartındaki ödeme yöntemi chip'lerinin sırası.
const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "card",
  "online",
  "meal_card",
  "iban",
];

// Yemek kartı markaları — kurye "Yemek Kartı" seçince modalde bunlardan birini seçer.
const MEAL_CARD_BRANDS: { value: MealCardBrand; label: string }[] = [
  { value: "multinet", label: "Multinet" },
  { value: "setcard", label: "Setcard" },
  { value: "pluxee", label: "Pluxee" },
  { value: "edenred", label: "Edenred" },
  { value: "tokenflex", label: "Tokenflex" },
  { value: "metropol", label: "Metropol" },
];
const MEAL_CARD_BRAND_LABEL: Record<string, string> = Object.fromEntries(
  MEAL_CARD_BRANDS.map((b) => [b.value, b.label]),
);

function fullAddress(o: Order): string {
  return [o.customer.address, o.customer.addressDetail, o.customer.district]
    .filter(Boolean)
    .join(", ");
}

// "Teslim edildi" bildirimi — sade: adres — ödeme tipi — Teslim edildi.
// Numara YOK: WhatsApp'ın sohbet seçme ekranı açılır, kurye grubu seçip gönderir.
// (WhatsApp deep-link ile belirli bir gruba doğrudan mesaj atmaya izin vermez.)
// whatsapp:// protokolü → wa.me (WhatsApp Web) yerine doğrudan yüklü UYGULAMAYI açar
// ve özel protokol olduğu için mevcut sayfayı boşaltmaz (kurye listesinde kalırız).
// settledDebt: kurye bu teslimde müşterinin ÖNCEKİ açık hesaplarını da tahsil
// ettiyse (onay ekranındaki "Eski borçları da aldım"), mesaja eklenir ki grupta
// "eski borç da kapandı" net görülsün.
function buildWhatsAppUrl(
  o: Order,
  opts: { openAccount?: boolean; settledDebt?: CustomerOpenAccounts | null } = {},
): string {
  const { openAccount = false, settledDebt = null } = opts;
  const payLabel = openAccount
    ? "AÇIK HESAP (ödeme alınamadı)"
    : (PAYMENT_LABEL[o.payment.method]?.label ?? "Ödeme");
  let text = `${fullAddress(o)} — ${payLabel} — Teslim edildi`;
  if (settledDebt && settledDebt.count > 0) {
    text += ` + ${settledDebt.count} eski hesap tahsil edildi (${formatCurrency(settledDebt.total)})`;
  }
  return `whatsapp://send?text=${encodeURIComponent(text)}`;
}

// GPS konumunu yakala. Başarısızlıkta kullanıcıya gösterilecek somut sebebi döner.
// (Eskiden hata sessizce yutuluyordu; "bazı adresler neden pinlenmiyor" görünmüyordu.)
type GeoResult =
  | { ok: true; geo: { lat: number; lng: number; accuracy?: number } }
  | { ok: false; reason: string };

function geoErrorReason(err: GeolocationPositionError): string {
  return err.code === err.PERMISSION_DENIED
    ? "Konum izni reddedildi — tarayıcı ayarlarından izin ver."
    : err.code === err.POSITION_UNAVAILABLE
      ? "Konum sinyali alınamadı (kapalı alan / GPS kapalı)."
      : err.code === err.TIMEOUT
        ? "Konum zaman aşımına uğradı — açık alanda tekrar dene."
        : "Konum alınamadı.";
}

// Tek bir getCurrentPosition denemesini Promise'e sarar + watchdog ekler.
// Bazı tarayıcılarda izin penceresi yanıtlanmazsa ne başarı ne hata callback'i
// gelir ve `timeout` bu süreyi saymaz → spinner sonsuza kadar takılır. Watchdog
// bunu keser ve sentetik TIMEOUT döndürür ki UI asla kilitlenmesin.
function tryPosition(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      fn();
    };
    const watchdog = setTimeout(
      () =>
        finish(() =>
          reject({
            code: 3,
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
            message: "watchdog timeout",
          } as GeolocationPositionError),
        ),
      (opts.timeout ?? 12000) + 3000,
    );
    navigator.geolocation.getCurrentPosition(
      (pos) => finish(() => resolve(pos)),
      (err) => finish(() => reject(err)),
      opts,
    );
  });
}

// GPS konumunu yakala. İki aşamalı: önce yüksek doğruluk (makul cache toleransıyla),
// zaman aşımı/sinyal yoksa düşük doğruluğa (WiFi/hücre — hızlı döner) düş. Böylece
// kapalı alan / yavaş GPS'te "zaman aşımı" hatası büyük ölçüde önlenir; düşük
// doğruluklu fix zaten amber "düşük doğruluk" olarak işaretlenir.
async function getPosition(): Promise<GeoResult> {
  // Geolocation güvenli bağlam (HTTPS) ister; HTTP'de tarayıcı sessizce reddeder.
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return {
      ok: false,
      reason:
        "Güvenli bağlantı (HTTPS) gerekli — tarayıcı konuma izin vermiyor.",
    };
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, reason: "Cihaz konum servisini desteklemiyor." };
  }

  // Hızlı tanı: izin kalıcı olarak reddedilmişse 22 sn beklemeden anında bildir.
  try {
    const perm = await navigator.permissions?.query({
      name: "geolocation" as PermissionName,
    });
    if (perm?.state === "denied") {
      return {
        ok: false,
        reason:
          "Konum izni kapalı — adres çubuğundaki kilit/konum simgesinden izin ver (masaüstünde ayrıca Windows konum hizmetinin açık olması gerekir).",
      };
    }
  } catch {
    // permissions API yok/desteklenmiyor — normal akışla devam et.
  }

  const toGeo = (pos: GeolocationPosition): GeoResult => ({
    ok: true,
    geo: {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Number.isFinite(pos.coords.accuracy)
        ? pos.coords.accuracy
        : undefined,
    },
  });

  // 1) Yüksek doğruluk. maximumAge 15sn: kapıda yeterince taze, ama sıfırdan fix
  //    beklemeye zorlayıp gereksiz timeout üretmez.
  try {
    return toGeo(
      await tryPosition({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
      }),
    );
  } catch (e) {
    const err = e as GeolocationPositionError;
    // İzin reddedildiyse ikinci deneme de reddedilir — direkt bildir.
    if (err.code === err.PERMISSION_DENIED) {
      return { ok: false, reason: geoErrorReason(err) };
    }
    // 2) Düşük doğruluk (WiFi/hücre). Hızlı döner; timeout senaryosunu kurtarır.
    //    Sonuç yine accuracy eşiğinden geçer — uzak/çöp konum kaydedilmez.
    try {
      return toGeo(
        await tryPosition({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        }),
      );
    } catch (e2) {
      return {
        ok: false,
        reason: geoErrorReason(e2 as GeolocationPositionError),
      };
    }
  }
}

// Bu doğruluğun (metre) altındaki GPS fix'i "iyi" sayılır → otomatik pinlenir.
// Üstündeyse haritada elle işaretlemeye düşülür (yanlış pin riskini insana bırakma).
const PIN_ACCURACY_WARN = 100;

export default function KuryePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // Kurye kimliği (cihazda saklı). null+ready → isim seçme kapısı gösterilir.
  const [courier, setCourier] = useState<string | null>(null);
  const [courierReady, setCourierReady] = useState(false);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  // Çoklu kurye modu (paneldeki Ayarlar'dan açılır). Kapalıyken tek-kurye sade akış.
  const [multiCourierMode, setMultiCourierMode] = useState(false);
  // Sekme: "mine" = Benim Paketlerim (detaylı teslim kartları), "pool" = Tüm
  // Paketler (kısa liste, check'leyerek üstlen).
  const [tab, setTab] = useState<"mine" | "pool">("mine");
  // Üstlenme (claim) işlemi süren sipariş — satırda spinner için.
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  // Hangi modda kaydediliyor — doğru butonun üzerinde spinner göstermek için.
  const [deliverMode, setDeliverMode] = useState<"paid" | "open" | null>(null);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  // "Eski borçları da aldım" kutucuğu — onay ekranında müşterinin eski açık hesabı
  // varsa görünür; işaretliyse teslimde tüm açık hesapları kapatır.
  const [settleDebt, setSettleDebt] = useState(false);
  // Pinleme durumu — teslimden tamamen ayrı. Kurye kapıda "Konumu Pinle"ye basar.
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [pinErrors, setPinErrors] = useState<Record<string, string>>({});
  // Ödeme yöntemi değiştirme hatası (sipariş bazında) — chip'lerin altında gösterilir.
  const [payErrors, setPayErrors] = useState<Record<string, string>>({});
  // Yemek kartı marka seçme modalı: hangi siparişin markası seçiliyor.
  const [brandOrder, setBrandOrder] = useState<Order | null>(null);
  // Harita seçici (manuel pinleme): hangi sipariş + harita merkezi.
  const [pickerOrder, setPickerOrder] = useState<Order | null>(null);
  const [pickerCenter, setPickerCenter] = useState<LatLng>(DEFAULT_MAP_CENTER);
  const [pickerSaving, setPickerSaving] = useState(false);
  const startX = useRef<number | null>(null);

  const load = async () => {
    try {
      // Tek round-trip: paketler + çoklu kurye modu birlikte gelir.
      const { orders: data, multiCourierMode: mode } = await getCourierBoard();
      setOrders(data);
      setMultiCourierMode(mode);
    } finally {
      setLoading(false);
    }
  };

  // Cihazda kayıtlı kurye adını oku + aktif kurye listesini çek (isim seçici için).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COURIER_KEY);
      if (saved) setCourier(saved);
    } catch {
      // localStorage erişilemezse isim seçtir.
    }
    setCourierReady(true);
    void getActiveCouriers().then(setCouriers);
  }, []);

  const pickCourier = (name: string) => {
    setCourier(name);
    try {
      localStorage.setItem(COURIER_KEY, name);
    } catch {
      // sessiz geç — bu oturumda state yeterli.
    }
  };

  const changeCourier = () => {
    setCourier(null);
    setTab("mine");
    try {
      localStorage.removeItem(COURIER_KEY);
    } catch {
      // sessiz geç
    }
    void getActiveCouriers().then(setCouriers);
  };

  useEffect(() => {
    void load();
    // Pusher (websocket) BİRİNCİL: değişiklikler anında gelir. Poll yalnızca
    // emniyet ağı (Pusher env yoksa / olay kaçarsa) — bu yüzden seyrek ve sayfa
    // arka plandayken duruyor.
    const poll = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    // Pusher patlamasını tek fetch'e indir: kısa bir pencerede gelen birçok olay
    // (örn. toplu durum değişikliği) tek bir yenilemede toplanır → refetch fırtınası yok.
    let burst: ReturnType<typeof setTimeout> | null = null;
    const coalescedLoad = () => {
      if (burst) return;
      burst = setTimeout(() => {
        burst = null;
        if (!document.hidden) void load();
      }, 600);
    };
    const unsubscribe = subscribeOrders(coalescedLoad);
    return () => {
      clearInterval(poll);
      if (burst) clearTimeout(burst);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, []);

  // Tüm aktif paketler, en eski ilk sırada (havuz/checklist görünümü).
  const allSorted = useMemo(
    () =>
      [...orders].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [orders],
  );

  // "Teslimat" akışı:
  //  • Çoklu kurye modunda SADECE üstlendiğim paketler (Tüm Paketler'den
  //    check'lediklerim). Boş/havuz paketler buraya karışmaz — onları Tüm
  //    Paketler'den seçerim, seçince buraya düşer.
  //  • Tek kurye modunda AYRIM YOK → tüm aktif paketler görünür. Çoklu moddan
  //    kalan kurye damgaları (Mehmet/Ayşe vb.) yok sayılır ki hiçbir sipariş
  //    "başka kuryede" diye görünmez kalmasın. Damga silinmez; panel/gün sonunda durur.
  const sorted = useMemo(
    () =>
      multiCourierMode
        ? allSorted.filter((o) => o.courier === courier)
        : allSorted,
    [allSorted, courier, multiCourierMode],
  );
  const deliverableCount = sorted.length;
  // Başka kuryelerin üstlendiği (bana görünmeyen) paket sayısı — boş durum mesajı.
  const othersCount = allSorted.length - deliverableCount;
  // Havuz = henüz kimsenin üstlenmediği paketler (rozet için).
  const poolCount = useMemo(
    () => allSorted.filter((o) => !o.courier).length,
    [allSorted],
  );
  // Çoklu kurye modu açıkken üstlenme/checklist görünür; kapalıyken sistem sade
  // kalır: sekme yok, üstlenme yok — tüm paketler doğrudan teslimatta (eski akış).
  const multiCourier = multiCourierMode;
  const activeTab = multiCourier ? tab : "mine";

  // Aktif indeks her zaman geçerli aralıkta kalsın.
  const idx = Math.min(active, Math.max(0, sorted.length - 1));
  const current = sorted[idx];

  const go = (i: number) => {
    setConfirming(false);
    setSettleDebt(false);
    setDeliverError(null);
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

  // Teslim onayı: ÖNCE durumu sunucuya yazmayı BEKLE, başarılı olunca WhatsApp'ı aç.
  // (Eski akış: WhatsApp'a aynı anda yönlendirip isteği "ateşle-unut" gönderiyordu;
  // mobilde sekme arka plana atılınca istek düşüp sipariş "hazırlanıyor"da kalıyordu.)
  // openAccount=true: ödeme alınamadı → sipariş teslim edilir ama "açık hesap"
  // olarak işaretlenir (sonra /open-accounts sayfasından tahsil edilir).
  const handleDeliver = async (o: Order, openAccount = false) => {
    setDeliveringId(o.id);
    setDeliverMode(openAccount ? "open" : "paid");
    setDeliverError(null);
    // Ödeme alındıysa ve "eski borçları da aldım" işaretliyse müşterinin tüm açık
    // hesaplarını kapat. Açık hesap (ödeme yok) yolunda anlamsız → gönderilmez.
    const settleOpenAccounts =
      !openAccount && settleDebt && !!o.customerOpenAccounts;
    const waUrl = buildWhatsAppUrl(o, {
      openAccount,
      settledDebt: settleOpenAccounts ? o.customerOpenAccounts : null,
    });
    try {
      const res = await fetch("/api/orders/deliver", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: o.id, openAccount, settleOpenAccounts }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Teslim güncellenemedi");
      }
      // Yazma onaylandı → listeden düş ve WhatsApp UYGULAMASINI aç.
      setOrders((prev) => prev.filter((x) => x.id !== o.id));
      setConfirming(false);
      setSettleDebt(false);
      // whatsapp:// özel protokolü işletim sistemine devredilir; sayfa boşalmaz,
      // yeni sekme açılmaz → kurye listesinde kalırız, mesaj hazır gelir.
      const a = document.createElement("a");
      a.href = waUrl;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      // Yazma başarısız: sipariş listede kalsın, kurye tekrar denesin.
      setDeliverError(
        err instanceof Error
          ? err.message
          : "Teslim kaydedilemedi, tekrar deneyin.",
      );
    } finally {
      setDeliveringId(null);
      setDeliverMode(null);
    }
  };

  const clearPayError = (id: string) =>
    setPayErrors((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });

  // Ödeme yöntemini optimistic güncelle + sunucuya yaz; sunucu reddederse geri al.
  // Tek yer: hem yöntem değişimi hem yemek kartı markası bunu kullanır (tekrar yok).
  const savePayment = async (
    o: Order,
    next: { method: PaymentMethod; mealCardBrand?: MealCardBrand },
  ) => {
    const prev = {
      method: o.payment.method,
      mealCardBrand: o.payment.mealCardBrand,
    };
    const patch = (p: { method: PaymentMethod; mealCardBrand?: MealCardBrand }) =>
      setOrders((list) =>
        list.map((x) =>
          x.id === o.id ? { ...x, payment: { ...x.payment, ...p } } : x,
        ),
      );
    patch(next);
    clearPayError(o.id);
    const res = await setOrderPaymentMethod(o.id, next.method, next.mealCardBrand);
    if (!res.ok) {
      patch(prev); // geri al
      setPayErrors((e) => ({
        ...e,
        [o.id]: res.error ?? "Ödeme yöntemi güncellenemedi",
      }));
    }
  };

  // Kurye kapıda gerçek yöntemi seçer. Yemek kartı → marka seçtirme modalını açar
  // (zaten yemek kartı olsa bile markayı değiştirebilmek için).
  const handleSetPayment = (o: Order, method: PaymentMethod) => {
    if (method === "meal_card") {
      setBrandOrder(o);
      return;
    }
    if (o.payment.method === method) return;
    void savePayment(o, { method, mealCardBrand: undefined });
  };

  // Modalden marka seçilince: meal_card + marka olarak kaydet.
  const applyMealCardBrand = (brand: MealCardBrand) => {
    const o = brandOrder;
    if (!o) return;
    setBrandOrder(null);
    void savePayment(o, { method: "meal_card", mealCardBrand: brand });
  };

  const clearPinError = (id: string) =>
    setPinErrors((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });

  // Konumu siparişe + müşteriye kaydet ve kartı anında güncelle.
  const persistPin = async (o: Order, geo: GeoPoint): Promise<boolean> => {
    try {
      await saveDeliveryLocation(o.id, geo);
      setOrders((prev) =>
        prev.map((x) =>
          x.id === o.id ? { ...x, customer: { ...x.customer, geo } } : x,
        ),
      );
      clearPinError(o.id);
      return true;
    } catch {
      setPinErrors((e) => ({
        ...e,
        [o.id]: "Konum kaydedilemedi, tekrar deneyin.",
      }));
      return false;
    }
  };

  // "Tüm Paketler"de bir siparişi üstlen / bırak (check kutusu). Optimistic:
  // satır anında güncellenir, sunucu reddederse (örn. başka kurye kapmış) taze
  // veriyi çekip gerçek duruma döner.
  const toggleClaim = async (o: Order) => {
    if (!courier) return;
    const mine = o.courier === courier;
    // Başka kurye almışsa kilitli — dokunulmaz.
    if (o.courier && !mine) return;

    setClaimingId(o.id);
    // Optimistic
    setOrders((prev) =>
      prev.map((x) =>
        x.id === o.id ? { ...x, courier: mine ? undefined : courier } : x,
      ),
    );
    const res = mine
      ? await unclaimOrder(o.id, courier)
      : await claimOrder(o.id, courier);
    setClaimingId(null);
    if (!res.ok) {
      // Çakışma/başarısızlık → sunucudaki gerçek duruma senkronla.
      await load();
    }
  };

  // Havuzdaki tüm boş paketleri tek dokunuşla üstlen (tek kurye / yoğun gün için).
  // Tek bulk çağrı: sunucuda tek updateMany + tek Pusher bildirimi.
  const claimAll = async () => {
    if (!courier) return;
    const free = allSorted.filter((o) => !o.courier);
    if (free.length === 0) return;
    setOrders((prev) =>
      prev.map((x) => (x.courier ? x : { ...x, courier })),
    );
    const res = await claimManyOrders(
      free.map((o) => o.id),
      courier,
    );
    if (!res.ok) await load(); // çakışma/başarısızlık → gerçek duruma senkronla
  };

  // Hibrit "Konumu Pinle": önce GPS dene. İYİ doğruluk gelirse otomatik kaydet
  // (harita yok). GPS yok / düşük doğruluk olursa haritada elle işaretlemeye düş —
  // yanlış/uzak pin asla sessizce kaydedilmez.
  const handlePin = async (o: Order) => {
    setPinningId(o.id);
    clearPinError(o.id);
    const res = await getPosition();
    setPinningId(null);

    if (
      res.ok &&
      res.geo.accuracy != null &&
      res.geo.accuracy <= PIN_ACCURACY_WARN
    ) {
      await persistPin(o, res.geo); // iyi GPS → tek dokunuş, otomatik
      return;
    }

    // GPS başarısız / düşük doğruluk / doğruluk bilinmiyor → haritada elle.
    if (!res.ok) {
      setPinErrors((e) => ({
        ...e,
        [o.id]: `${res.reason} Haritadan işaretleyebilirsin.`,
      }));
    }
    const center: LatLng = res.ok
      ? { lat: res.geo.lat, lng: res.geo.lng }
      : o.customer.geo
        ? { lat: o.customer.geo.lat, lng: o.customer.geo.lng }
        : DEFAULT_MAP_CENTER;
    openMap(o, center);
  };

  // Haritayı aç (hem otomatik fallback hem "haritadan seç" linki kullanır).
  const openMap = (o: Order, center: LatLng) => {
    setPickerCenter(center);
    setPickerOrder(o);
  };

  const openMapManual = (o: Order) => {
    const center: LatLng = o.customer.geo
      ? { lat: o.customer.geo.lat, lng: o.customer.geo.lng }
      : DEFAULT_MAP_CENTER;
    openMap(o, center);
  };

  // Haritada onaylanan konumu kaydet (elle → accuracy yok, insan-onaylı sayılır).
  const handlePickerConfirm = async (geo: LatLng) => {
    const o = pickerOrder;
    if (!o) return;
    setPickerSaving(true);
    const ok = await persistPin(o, { lat: geo.lat, lng: geo.lng });
    setPickerSaving(false);
    if (ok) setPickerOrder(null);
  };

  // ─── Kimlik kapısı ─────────────────────────────────────────────────────────
  // Cihazda kayıtlı kurye yoksa önce isim seçtir. Liste paneldeki "Ayarlar"dan
  // yönetilir; boşsa kurye admin'e başvurur.
  if (courierReady && !courier) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-linear-to-b from-slate-100 to-slate-200 px-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lg shadow-slate-300/40 ring-1 ring-slate-200">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-lime-500/15 text-2xl">
              🛵
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Kim teslim ediyor?</h1>
              <p className="text-sm text-slate-500">Adını seç, bu cihazda hatırlanır.</p>
            </div>
          </div>
          {couriers.length === 0 ? (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
              Henüz kurye tanımlı değil. Paneldeki <b>Ayarlar → Kuryeler</b>
              {" "}bölümünden ekleyebilirsin.
            </div>
          ) : (
            <div className="space-y-2">
              {couriers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCourier(c.name)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-800 ring-1 ring-slate-200 transition active:scale-[0.98] hover:bg-slate-100"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-sm text-white">
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                  {c.name}
                  <ChevronRight className="ml-auto h-5 w-5 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-linear-to-b from-slate-100 to-slate-200">
      {/* Üst başlık — kurye adı + sekmeler (Benim Paketlerim / Tüm Paketler) */}
      <header className="z-20 shrink-0 border-b border-slate-800 bg-slate-900/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <button
            onClick={changeCourier}
            className="flex items-center gap-2.5 rounded-xl py-1 pr-2 text-left transition active:scale-95"
            title="Kuryeyi değiştir"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-lime-500/20 text-sm font-bold text-lime-300">
              {courier ? courier.slice(0, 2).toUpperCase() : "🛵"}
            </span>
            <div>
              <h1 className="flex items-center gap-1 text-base font-bold leading-tight">
                {courier ?? "Teslimat"}
                <UserRound className="h-3.5 w-3.5 text-slate-400" />
              </h1>
              <p className="text-[11px] text-slate-400">değiştirmek için dokun</p>
            </div>
          </button>
          <button
            onClick={() => void load()}
            aria-label="Yenile"
            className="rounded-full p-2.5 text-slate-300 transition hover:bg-white/10 active:scale-90"
          >
            <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
          </button>
        </div>

        {/* Sekme çubuğu — yalnızca birden fazla kurye tanımlıysa. Tek kuryede
            sistem sadeleşir, doğrudan teslimat akışı gösterilir. */}
        {multiCourier && (
          <div className="mx-auto flex max-w-md gap-1 px-3 pb-2">
            <button
              onClick={() => setTab("mine")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition",
                activeTab === "mine"
                  ? "bg-white text-slate-900"
                  : "bg-white/5 text-slate-300 active:bg-white/10",
              )}
            >
              <Package className="h-4 w-4" />
              Teslimat
              {deliverableCount > 0 && (
                <span
                  className={cn(
                    "grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px]",
                    activeTab === "mine" ? "bg-slate-900 text-white" : "bg-lime-500 text-slate-900",
                  )}
                >
                  {deliverableCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("pool")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition",
                activeTab === "pool"
                  ? "bg-white text-slate-900"
                  : "bg-white/5 text-slate-300 active:bg-white/10",
              )}
            >
              <ListChecks className="h-4 w-4" />
              Tüm Paketler
              {poolCount > 0 && (
                <span
                  className={cn(
                    "grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px]",
                    activeTab === "pool" ? "bg-slate-900 text-white" : "bg-amber-400 text-slate-900",
                  )}
                >
                  {poolCount}
                </span>
              )}
            </button>
          </div>
        )}
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
        ) : activeTab === "pool" ? (
          <PoolList
            orders={allSorted}
            courier={courier}
            claimingId={claimingId}
            onToggle={(o) => void toggleClaim(o)}
            onClaimAll={() => void claimAll()}
          />
        ) : sorted.length === 0 || !current ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div
              className={cn(
                "grid h-16 w-16 place-items-center rounded-full",
                multiCourier && poolCount > 0 ? "bg-slate-200" : "bg-emerald-100",
              )}
            >
              {multiCourier && poolCount > 0 ? (
                <Package className="h-9 w-9 text-slate-500" />
              ) : (
                <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-700">
                {multiCourier
                  ? poolCount > 0
                    ? "Henüz paket üstlenmedin"
                    : "Sana ait paket yok"
                  : "Teslim edilecek paket yok"}
              </p>
              <p className="text-sm text-slate-500">
                {multiCourier
                  ? poolCount > 0
                    ? `Havuzda ${poolCount} paket var — "Tüm Paketler"den seç.`
                    : "Tüm paketler dağıtıldı 🎉"
                  : "Tüm siparişler teslim edildi 🎉"}
              </p>
            </div>
            {multiCourier && (poolCount > 0 || othersCount > 0) && (
              <button
                onClick={() => setTab("pool")}
                className="mt-1 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition active:scale-95"
              >
                <ListChecks className="h-4 w-4" />
                Tüm Paketler
              </button>
            )}
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
              <OrderCard
                key={current.id}
                o={current}
                pinning={pinningId === current.id}
                pinError={pinErrors[current.id]}
                payError={payErrors[current.id]}
                onPin={() => void handlePin(current)}
                onPickOnMap={() => openMapManual(current)}
                onSetPayment={(m) => void handleSetPayment(current, m)}
              />
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

      {/* Sabit alt aksiyon barı — yalnızca teslimat akışında, paket varken */}
      {activeTab === "mine" && current && (
        <footer className="z-20 shrink-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          {deliverError && (
            <div className="mx-auto flex max-w-md items-start gap-2 px-3 pt-2 text-sm font-medium text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{deliverError}</span>
            </div>
          )}
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
                    setDeliverError(null);
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
              <div className="flex w-full flex-col gap-2">
                {/* Eski borç varsa: ödeme alındığında onları da kapatma kutucuğu. */}
                {current.customerOpenAccounts && (
                  <button
                    type="button"
                    onClick={() => setSettleDebt((v) => !v)}
                    disabled={deliveringId === current.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold ring-1 transition disabled:opacity-60",
                      settleDebt
                        ? "bg-emerald-50 text-emerald-800 ring-emerald-300"
                        : "bg-slate-50 text-slate-600 ring-slate-200",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-md ring-1 transition",
                        settleDebt
                          ? "bg-emerald-600 text-white ring-emerald-600"
                          : "bg-white ring-slate-300",
                      )}
                    >
                      {settleDebt && <Check className="h-3.5 w-3.5" />}
                    </span>
                    Eski borçları da aldım ·{" "}
                    {current.customerOpenAccounts.count} hesap ·{" "}
                    {formatCurrency(current.customerOpenAccounts.total)}
                  </button>
                )}
                <div className="flex items-stretch gap-2.5">
                  <button
                    onClick={() => {
                      setConfirming(false);
                      setSettleDebt(false);
                    }}
                    disabled={deliveringId === current.id}
                    aria-label="Vazgeç"
                    className="flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-slate-100 text-slate-600 transition active:scale-95 disabled:opacity-50"
                  >
                    <X className="h-5 w-5" />
                    <span className="text-xs font-semibold">Vazgeç</span>
                  </button>
                  {/* İki teslim yolu: ödeme alındı (yeşil) veya alınamadı → açık hesap
                      (amber). Her ikisinde de durum önce sunucuya yazılır, sonra
                      WhatsApp açılır. */}
                  <div className="flex flex-1 flex-col gap-2">
                    <button
                      onClick={() => void handleDeliver(current)}
                      disabled={deliveringId === current.id}
                      className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl bg-emerald-600 py-3 text-white shadow-sm shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-70"
                    >
                      {deliveringId === current.id && deliverMode === "paid" ? (
                        <span className="flex items-center gap-2 text-base font-bold">
                          <Loader2 className="h-5 w-5 animate-spin" />{" "}
                          Kaydediliyor…
                        </span>
                      ) : (
                        <>
                          <span className="flex items-center gap-2 text-base font-bold">
                            <CheckCircle2 className="h-5 w-5" /> Ödeme Alındı &
                            Teslim
                          </span>
                          <span className="text-[11px] font-medium text-emerald-100">
                            Teslim kaydedilir, sonra WhatsApp açılır
                          </span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => void handleDeliver(current, true)}
                      disabled={deliveringId === current.id}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 py-2.5 text-sm font-bold text-white shadow-sm shadow-amber-500/25 transition active:scale-[0.98] disabled:opacity-70"
                    >
                      {deliveringId === current.id && deliverMode === "open" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />{" "}
                          Kaydediliyor…
                        </>
                      ) : (
                        <>
                          <WalletCards className="h-4 w-4" /> Ödeme Alınamadı ·
                          Açık Hesap
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </footer>
      )}

      {/* Manuel konum seçici (hibrit fallback + "haritadan seç") */}
      <LocationPicker
        open={!!pickerOrder}
        center={pickerCenter}
        addressLabel={pickerOrder ? fullAddress(pickerOrder) : ""}
        saving={pickerSaving}
        onConfirm={(geo) => void handlePickerConfirm(geo)}
        onCancel={() => setPickerOrder(null)}
      />

      {/* Yemek kartı marka seçici (bottom-sheet) — "Yemek Kartı" seçilince açılır,
          marka seçmeden geçilmez. Böylece hangi kart olduğu net kaydedilir. */}
      {brandOrder && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setBrandOrder(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <WalletCards className="h-5 w-5 text-orange-600" />
              <h3 className="text-base font-bold text-slate-900">
                Hangi yemek kartı?
              </h3>
              <button
                onClick={() => setBrandOrder(null)}
                aria-label="Kapat"
                className="ml-auto grid h-8 w-8 place-items-center rounded-full text-slate-400 transition active:scale-90 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {MEAL_CARD_BRANDS.map((b) => {
                const active =
                  brandOrder.payment.method === "meal_card" &&
                  brandOrder.payment.mealCardBrand === b.value;
                return (
                  <button
                    key={b.value}
                    onClick={() => void applyMealCardBrand(b.value)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold ring-1 transition active:scale-[0.97]",
                      active
                        ? "bg-orange-500 text-white ring-orange-500"
                        : "bg-white text-slate-700 ring-slate-200 active:bg-slate-50",
                    )}
                  >
                    {active && <Check className="h-4 w-4" />}
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Havuz listesinde kısa adres (kart başlığını şişirmeden).
function shortAddress(o: Order): string {
  return [o.customer.address, o.customer.district].filter(Boolean).join(", ");
}

// ─── Tüm Paketler (havuz / checklist) ────────────────────────────────────────
// Bütün aktif paketler alt alta, kısaca: #no · adres · ödeme. Kurye kendi
// aldıklarını check'ler → "Benim Paketlerim"e geçer. Başka kuryenin aldığı satır
// kilitli ve onun adıyla görünür (ikisi aynı paketi almasın).
function PoolList({
  orders,
  courier,
  claimingId,
  onToggle,
  onClaimAll,
}: {
  orders: Order[];
  courier: string | null;
  claimingId: string | null;
  onToggle: (o: Order) => void;
  onClaimAll: () => void;
}) {
  const freeCount = orders.filter((o) => !o.courier).length;

  if (orders.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <p className="font-semibold text-slate-700">Aktif paket yok 🎉</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 py-3">
      {/* Yoğun gün / tek kurye: tek dokunuşla tüm boş paketleri üstlen. */}
      {freeCount > 1 && (
        <button
          onClick={onClaimAll}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white shadow-sm transition active:scale-[0.98]"
        >
          <ListChecks className="h-4 w-4" />
          Hepsini Al ({freeCount})
        </button>
      )}

      {orders.map((o) => {
        const mine = o.courier === courier;
        const claimedByOther = !!o.courier && !mine;
        const busy = claimingId === o.id;
        const pay = PAYMENT_LABEL[o.payment.method];
        const itemCount = o.items.reduce((s, i) => s + i.quantity, 0);
        return (
          <button
            key={o.id}
            onClick={() => onToggle(o)}
            disabled={claimedByOther || busy}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 transition active:scale-[0.99]",
              mine
                ? "bg-lime-50 ring-lime-300"
                : claimedByOther
                  ? "bg-slate-50 ring-slate-200 opacity-70"
                  : "bg-white ring-slate-200",
            )}
          >
            {/* Check durumu */}
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-lg ring-1 transition",
                mine
                  ? "bg-lime-500 text-white ring-lime-500"
                  : claimedByOther
                    ? "bg-slate-200 text-slate-400 ring-slate-200"
                    : "bg-white ring-slate-300",
              )}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : mine ? (
                <Check className="h-4 w-4" />
              ) : claimedByOther ? (
                <Lock className="h-3.5 w-3.5" />
              ) : null}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  #{o.orderNumber}
                </span>
                {pay && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                      pay.tone,
                    )}
                  >
                    <pay.icon className="h-3 w-3" />
                    {pay.label}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(o.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-600">
                {shortAddress(o)}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                <span>{itemCount} ürün · {formatCurrency(o.total)}</span>
                {claimedByOther && (
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                    <UserRound className="h-3 w-3" />
                    {o.courier}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Tek sipariş kartı ───────────────────────────────────────────────────────
function OrderCard({
  o,
  pinning,
  pinError,
  onPin,
  onPickOnMap,
  payError,
  onSetPayment,
}: {
  o: Order;
  pinning: boolean;
  pinError?: string;
  payError?: string;
  onPin: () => void;
  onPickOnMap: () => void;
  onSetPayment: (method: PaymentMethod) => void;
}) {
  const [itemsOpen, setItemsOpen] = useState(false);
  const [debtOpen, setDebtOpen] = useState(false);
  const debt = o.customerOpenAccounts;
  const pay = PAYMENT_LABEL[o.payment.method];
  const itemCount = o.items.reduce((s, i) => s + i.quantity, 0);
  // Pinlenmiş konum varsa kesin koordinata git; yoksa metin adresini geocode et.
  const geo = o.customer.geo;
  const hasPin = !!geo;
  const acc = geo?.accuracy;
  const lowAccuracy = acc != null && acc > PIN_ACCURACY_WARN;
  const mapsUrl = hasPin
    ? `https://www.google.com/maps/search/?api=1&query=${geo!.lat},${geo!.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(o))}`;
  const detail = [o.customer.addressDetail, o.customer.district]
    .filter(Boolean)
    .join(" · ");

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
            {o.payment.method === "meal_card" && o.payment.mealCardBrand && (
              <span className="text-orange-300">
                · {MEAL_CARD_BRAND_LABEL[o.payment.mealCardBrand]}
              </span>
            )}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" /> {formatRelativeTime(o.createdAt)}
        </span>
      </div>

      {/* Açık hesap uyarısı — bu müşterinin ÖNCEKİ ödenmemiş siparişleri.
          Kurye kapıda görsün ki eski borcu da tahsil etmeyi deneyebilsin. */}
      {debt && (
        <div className="border-b border-red-100 bg-red-50">
          <button
            onClick={() => setDebtOpen((v) => !v)}
            aria-expanded={debtOpen}
            className="flex w-full items-center gap-2 px-5 py-2.5 text-left"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <span className="text-sm font-bold text-red-700">
              {debt.count} ödenmemiş sipariş · {formatCurrency(debt.total)}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 text-red-400 transition-transform",
                debtOpen && "rotate-180",
              )}
            />
          </button>
          {debtOpen && (
            <ul className="space-y-1 px-5 pb-3">
              {debt.orders.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-red-100"
                >
                  <span className="font-semibold text-slate-700">
                    #{d.orderNumber}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {formatRelativeTime(d.createdAt)}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums text-red-700">
                    {formatCurrency(d.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Adres — kartın kahramanı */}
      <div className="px-5 pt-5">
        <div className="flex items-start gap-3">
          <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-50 ring-1 ring-rose-100">
            <MapPin className="h-6 w-6 text-rose-500" />
            {/* Konum durumu rozeti — sadece ikon: yeşil ✓ pinli, amber ✓ düşük
                doğruluk, amber ⚠ henüz pin yok. */}
            {hasPin ? (
              <span
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow-sm"
                title={
                  lowAccuracy ? "Konum pinli (düşük doğruluk)" : "Konum pinli"
                }
              >
                <CheckCircle2
                  className={cn(
                    "h-5 w-5",
                    lowAccuracy ? "text-amber-500" : "text-emerald-500",
                  )}
                />
              </span>
            ) : (
              <span
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow-sm"
                title="Konum henüz pinlenmedi"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xl leading-tight font-extrabold tracking-tight text-slate-900">
              {o.customer.address}
            </p>
            {detail && (
              <p className="mt-1 text-sm font-medium text-slate-500">
                {detail}
              </p>
            )}
          </div>
        </div>

        {/* Birincil aksiyonlar — Yol Tarifi (büyük) + konum aksiyonu yan yana.
            İkisi de net ve dengeli: pin durumu adres ikonundaki rozetten okunur,
            buradaki konum butonu yalnızca aksiyondur (Pinle / Düzelt). */}
        <div className="mt-4 flex items-stretch gap-2.5">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 text-base font-bold text-white shadow-sm shadow-blue-600/25 transition active:scale-[0.98]"
          >
            <Navigation className="h-5 w-5 fill-white" /> Yol Tarifi
          </a>

          {hasPin ? (
            <button
              onClick={onPickOnMap}
              aria-label="Konumu düzelt"
              className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-slate-100 py-3 text-slate-700 ring-1 ring-slate-200 transition active:scale-95"
            >
              <MapPin className="h-5 w-5 text-blue-600" />
              <span className="text-xs font-bold">Düzelt</span>
            </button>
          ) : (
            <button
              onClick={onPin}
              disabled={pinning}
              aria-label="Konumu pinle"
              className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-amber-500 py-3 text-white shadow-sm shadow-amber-500/25 transition active:scale-95 disabled:opacity-70"
            >
              {pinning ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LocateFixed className="h-5 w-5" />
              )}
              <span className="text-xs font-bold">
                {pinning ? "Alınıyor…" : "Pinle"}
              </span>
            </button>
          )}
        </div>
        {pinError && (
          <p className="mt-2 text-xs font-medium text-amber-700">{pinError}</p>
        )}
      </div>

      {/* Müşteri + tutar */}
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            Müşteri
          </p>
          <p className="truncate text-base font-bold text-slate-900">
            {o.customer.name}
          </p>
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

      {/* Ödeme yöntemi — kurye kapıda gerçek yöntemi seçer; anında kaydedilir.
          Seçili yöntem koyu, diğerleri açık; üstteki başlık rozeti de güncellenir. */}
      <div className="border-t border-slate-100 px-5 py-4">
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
          Ödeme Yöntemi
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_METHODS.map((m) => {
            const meta = PAYMENT_LABEL[m];
            const active = o.payment.method === m;
            return (
              <button
                key={m}
                onClick={() => onSetPayment(m)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold ring-1 transition active:scale-95",
                  active
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-600 ring-slate-200",
                )}
              >
                <meta.icon className="h-4 w-4" />
                {meta.label}
              </button>
            );
          })}
        </div>
        {/* Seçili yemek kartı markası + değiştir — modalı yeniden açar. */}
        {o.payment.method === "meal_card" && (
          <button
            onClick={() => onSetPayment("meal_card")}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-200 transition active:scale-95"
          >
            <WalletCards className="h-3.5 w-3.5" />
            {o.payment.mealCardBrand
              ? MEAL_CARD_BRAND_LABEL[o.payment.mealCardBrand]
              : "Marka seç"}
            <span className="text-orange-400">· değiştir</span>
          </button>
        )}
        {payError && (
          <p className="mt-2 text-xs font-medium text-rose-600">{payError}</p>
        )}
      </div>

      {/* Sipariş içeriği — açılır-kapanır (accordion); varsayılan kapalı */}
      <div className="border-t border-slate-100 bg-slate-50/60">
        <button
          onClick={() => setItemsOpen((v) => !v)}
          aria-expanded={itemsOpen}
          className="flex w-full items-center gap-2 px-5 py-3 text-left transition active:bg-slate-100"
        >
          <ShoppingBag className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-bold text-slate-700">
            {itemCount} Ürün
          </span>
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
                    <p className="mt-0.5 text-xs font-medium text-amber-700">
                      ↳ {item.note}
                    </p>
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
