import { ArrowRightLeft, Banknote, Coins, CreditCard, Globe, Ticket, type LucideIcon } from "lucide-react";

import type {
  EndOfDayOrder,
  EndOfDayReport,
  EndOfDaySplitPart,
  EndOfDayTrendyol,
} from "@/actions/endOfDay";
import { MEAL_CARD_PROVIDER_CUT } from "@/lib/commission";

// Gün Sonu'nun ortak dili: ödeme yöntemi rengi/etiketi, filtre modeli, küçük
// biçim yardımcıları. Para Defteri, filtre çipi ve liste aynı renkleri kullanır.

// "Bu tutar fiilen var mı" eşiği — kuruş yuvarlama gürültüsünü ele.
export const EPSILON = 0.5;

// Ödeme yöntemi paleti — renk körlüğü + açık/koyu tema doğrulamasından geçti
// (dataviz validator). Sıra sabittir; renk yöntemi izler, sırasını değil.
export const METHOD_META: Record<
  string,
  { label: string; short: string; color: string; icon: LucideIcon }
> = {
  cash: { label: "Nakit", short: "Nakit", color: "#059669", icon: Banknote },
  card: { label: "Kredi / Banka Kartı", short: "Kart", color: "#6366f1", icon: CreditCard },
  meal_card: { label: "Yemek Kartı", short: "Yemek K.", color: "#d97706", icon: Ticket },
  online: { label: "Online Ödeme", short: "Online", color: "#db2777", icon: Globe },
  iban: { label: "IBAN / Havale", short: "IBAN", color: "#0891b2", icon: ArrowRightLeft },
  other: { label: "Belirsiz", short: "Diğer", color: "#64748b", icon: Coins },
};
export const METHOD_ORDER = ["cash", "card", "meal_card", "online", "iban", "other"];

export const CHANNEL_DOT = { own: "bg-blue-500", trendyol: "bg-orange-500" } as const;

// Sipariş listesinin filtresi. scope = Para Defteri'nde seçilen satır
// ("Kendi · Nakit", "Yemek kartı · Multinet"…); kurye/durum/arama listenin kendi
// süzgeçleri. Boş alan = süzme yok.
export interface LedgerScope {
  key: string; // defter satırı anahtarı (seçili satırı vurgulamak için)
  label: string;
  channel?: "own" | "trendyol";
  methods?: string[];
  brand?: string; // yemek kartı markası
  onDoor?: boolean; // Trendyol: kapıda (true) / online (false)
}

// Kapsam anahtarı → kapsam. Filtre adres çubuğunda yalnız anahtarla tutulur
// (?kapsam=own-cash); geri gelince buradan yeniden kurulur. Defter ve kanal
// düğmesi de kapsamı buradan üretir → tek tanım.
export function scopeFromKey(key: string): LedgerScope | undefined {
  if (key === "ty-bank") return { key, label: "Trendyol · online", channel: "trendyol", onDoor: false };
  if (key === "ty-receipt")
    return { key, label: "Trendyol · online kart", channel: "trendyol", onDoor: false, methods: ["online"] };
  if (key === "ty-door") return { key, label: "Trendyol · kapıda", channel: "trendyol", onDoor: true };
  if (key === "ch-own") return { key, label: "Kendi", channel: "own" };
  if (key === "ch-trendyol") return { key, label: "Trendyol", channel: "trendyol" };
  if (key.startsWith("own-meal-")) {
    const brand = key.slice("own-meal-".length);
    return { key, label: `Yemek kartı · ${brand}`, channel: "own", methods: ["meal_card"], brand };
  }
  if (key.startsWith("own-")) {
    const m = key.slice(4);
    if (!METHOD_META[m]) return undefined;
    return { key, label: `Kendi · ${METHOD_META[m].short}`, channel: "own", methods: [m] };
  }
  return undefined;
}

export interface OrderFilter {
  scope?: LedgerScope;
  courier?: string; // NO_COURIER = kurye atanmamış
  state?: "cancelled" | "open" | "late";
  q?: string;
  adv?: AdvancedFilter;
  sort?: SortKey;
}

// Detaylı filtre (Filtre paneli). Grup içi seçimler VEYA, gruplar arası VE.
export type AdvStatus = "delivered" | "active" | "open" | "late" | "cancelled";
export interface AdvancedFilter {
  methods?: string[]; // cash/card/online/meal_card/iban
  brands?: string[]; // yemek kartı markası (yalnız yemek kartı parçaları)
  from?: string; // "HH:MM" — from > to ise gece yarısını aşar (22:00–04:00)
  to?: string;
  statuses?: AdvStatus[];
  min?: number; // sipariş tutarı (brüt)
  max?: number;
  districts?: string[];
}

export type SortKey = "new" | "old" | "amount-desc" | "amount-asc" | "slow";

export const ADV_STATUS_LABEL: Record<AdvStatus, string> = {
  delivered: "Teslim edildi",
  active: "Yolda / aktif",
  open: "Açık hesap",
  late: "Geç teslim",
  cancelled: "İptal",
};

export const SORT_LABEL: Record<SortKey, string> = {
  new: "En yeni",
  old: "En eski",
  "amount-desc": "Tutar ↓",
  "amount-asc": "Tutar ↑",
  slow: "En uzun teslim",
};

export const NO_BRAND = "Belirtilmemiş";

// Kaç detaylı filtre grubu dolu — Filtre düğmesindeki rozet.
export function advCount(a: AdvancedFilter | undefined): number {
  if (!a) return 0;
  return (
    (a.methods?.length ? 1 : 0) +
    (a.brands?.length ? 1 : 0) +
    (a.from || a.to ? 1 : 0) +
    (a.statuses?.length ? 1 : 0) +
    (a.min != null || a.max != null ? 1 : 0) +
    (a.districts?.length ? 1 : 0)
  );
}

// Boş grupları at; hiçbiri kalmazsa undefined (adres çubuğu temiz kalsın).
export function cleanAdv(a: AdvancedFilter): AdvancedFilter | undefined {
  const out: AdvancedFilter = {};
  if (a.methods?.length) out.methods = a.methods;
  if (a.brands?.length) out.brands = a.brands;
  if (a.from) out.from = a.from;
  if (a.to) out.to = a.to;
  if (a.statuses?.length) out.statuses = a.statuses;
  if (a.min != null) out.min = a.min;
  if (a.max != null) out.max = a.max;
  if (a.districts?.length) out.districts = a.districts;
  return advCount(out) > 0 ? out : undefined;
}

function inHours(time: string, from?: string, to?: string): boolean {
  if (from && to && from > to) return time >= from || time <= to; // gece yarısını aşan aralık
  return (!from || time >= from) && (!to || time <= to);
}

function advStatusMatch(o: EndOfDayOrder, s: AdvStatus, targetMin: number): boolean {
  if (s === "open") return o.open;
  if (s === "late") return isLate(o, targetMin);
  return o.status === s;
}

// Parça detaylı filtrenin yöntem/marka şartına uyuyor mu.
function advPartMatch(p: EndOfDaySplitPart, a: AdvancedFilter | undefined): boolean {
  if (a?.methods?.length && !a.methods.includes(p.method)) return false;
  if (a?.brands?.length && !(p.method === "meal_card" && a.brands.includes(p.mealCardBrand ?? NO_BRAND))) return false;
  return true;
}

// URL ↔ detaylı filtre + sıralama. Liste değerleri "|" ile ayrılır (marka/mahalle
// adında virgül olabilir).
const SORT_KEYS = Object.keys(SORT_LABEL) as SortKey[];
const ADV_STATUSES = Object.keys(ADV_STATUS_LABEL) as AdvStatus[];
const HHMM = /^\d{2}:\d{2}$/;

export function advToParams(f: OrderFilter, q: URLSearchParams) {
  const a = f.adv;
  if (a?.methods?.length) q.set("odeme", a.methods.join("|"));
  if (a?.brands?.length) q.set("marka", a.brands.join("|"));
  if (a?.from || a?.to) q.set("saat", `${a.from ?? ""}-${a.to ?? ""}`);
  if (a?.statuses?.length) q.set("asama", a.statuses.join("|"));
  if (a?.min != null) q.set("min", String(a.min));
  if (a?.max != null) q.set("max", String(a.max));
  if (a?.districts?.length) q.set("mahalle", a.districts.join("|"));
  if (f.sort && f.sort !== "new") q.set("sirala", f.sort);
}

export function advFromParams(q: URLSearchParams): Pick<OrderFilter, "adv" | "sort"> {
  const list = (k: string) => q.get(k)?.split("|").filter(Boolean);
  const num = (k: string) => {
    const n = Number(q.get(k));
    return q.get(k) && Number.isFinite(n) ? n : undefined;
  };
  const [from, to] = (q.get("saat") ?? "-").split("-");
  const sort = q.get("sirala") as SortKey | null;
  return {
    adv: cleanAdv({
      methods: list("odeme")?.filter((m) => METHOD_META[m]),
      brands: list("marka"),
      from: HHMM.test(from) ? from : undefined,
      to: HHMM.test(to) ? to : undefined,
      statuses: list("asama")?.filter((x): x is AdvStatus => ADV_STATUSES.includes(x as AdvStatus)),
      min: num("min"),
      max: num("max"),
      districts: list("mahalle"),
    }),
    sort: sort && SORT_KEYS.includes(sort) ? sort : undefined,
  };
}

export function sortOrders(list: EndOfDayOrder[], sort: SortKey | undefined): EndOfDayOrder[] {
  if (!sort || sort === "new") return list; // sunucu zaten en yeni → en eski sıralı
  const out = [...list];
  if (sort === "old") out.reverse();
  else if (sort === "amount-desc") out.sort((a, b) => b.total - a.total);
  else if (sort === "amount-asc") out.sort((a, b) => a.total - b.total);
  else if (sort === "slow") out.sort((a, b) => (b.durationMin ?? -1) - (a.durationMin ?? -1));
  return out;
}

export const NO_COURIER = "__none__";

// Siparişin yöntem parçaları: bölünmüşse parçalar, değilse tamamı tek yöntem.
export function orderParts(o: EndOfDayOrder): EndOfDaySplitPart[] {
  return o.split ?? [{ method: o.method, amount: o.total, mealCardBrand: o.mealCardBrand }];
}

// Kapsamdaki parçalar (yöntem + marka; defter kapsamı + detaylı filtre).
// Hiç yöntem şartı yoksa tüm parçalar.
function scopedParts(o: EndOfDayOrder, sc: LedgerScope | undefined, a?: AdvancedFilter): EndOfDaySplitPart[] {
  return orderParts(o).filter(
    (p) =>
      (!sc?.methods || sc.methods.includes(p.method)) &&
      (!sc?.brand || (p.mealCardBrand ?? NO_BRAND) === sc.brand) &&
      advPartMatch(p, a),
  );
}

function hasPartRule(sc: LedgerScope | undefined, a: AdvancedFilter | undefined): boolean {
  return !!(sc?.methods || sc?.brand || a?.methods?.length || a?.brands?.length);
}

// Kapsama düşen tutar: bölünmüş siparişte yalnız ilgili parça ("Nakit" filtresinde
// 300 nakit + 100 kart → 300), aksi halde sipariş toplamı.
export function scopedAmount(o: EndOfDayOrder, f: OrderFilter): number {
  if (!o.split || !hasPartRule(f.scope, f.adv)) return o.total;
  return scopedParts(o, f.scope, f.adv).reduce((s, p) => s + p.amount, 0);
}

export function matchesFilter(o: EndOfDayOrder, f: OrderFilter, targetMin: number): boolean {
  const sc = f.scope;
  const a = f.adv;
  if (sc?.channel && o.channel !== sc.channel) return false;
  if (hasPartRule(sc, a) && scopedParts(o, sc, a).length === 0) return false;
  if (sc?.onDoor != null && o.onDoor !== sc.onDoor) return false;
  if (f.courier && (o.courier ?? NO_COURIER) !== f.courier) return false;
  if (f.state === "cancelled" && o.status !== "cancelled") return false;
  if (f.state === "open" && !o.open) return false;
  if (f.state === "late" && !isLate(o, targetMin)) return false;
  // İptaller yalnız "İptal" seçilince görünür — aksi halde toplamları şişirir.
  if (f.state !== "cancelled" && !a?.statuses?.includes("cancelled") && o.status === "cancelled") return false;
  if (a?.statuses?.length && !a.statuses.some((x) => advStatusMatch(o, x, targetMin))) return false;
  if ((a?.from || a?.to) && !inHours(o.time, a.from, a.to)) return false;
  if (a?.min != null && o.total < a.min) return false;
  if (a?.max != null && o.total > a.max) return false;
  if (a?.districts?.length && !a.districts.includes(o.district ?? "")) return false;
  if (f.q) {
    const q = f.q.toLocaleLowerCase("tr-TR");
    if (
      !o.orderNumber.includes(q) &&
      !o.customer.toLocaleLowerCase("tr-TR").includes(q) &&
      !(o.district ?? "").toLocaleLowerCase("tr-TR").includes(q)
    )
      return false;
  }
  return true;
}

export function isLate(o: EndOfDayOrder, targetMin: number): boolean {
  return o.status === "delivered" && o.durationMin != null && o.durationMin > targetMin;
}

// "1.234,50" / "1234.5" / "" → number | null. Boş veya geçersizse null.
export function parseAmount(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Istanbul "bugün" tarihini YYYY-MM-DD olarak verir.
export function istanbulToday(): string {
  const ist = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = `${ist.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${ist.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatDayTR(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Trendyol'un sana fiilen geçen neti — TEK KAYNAK (özet, Kasa sekmesi, paylaşım).
//   bankNet   = online (kredi kartı + yemek kartı) bankaya yatacak net
//   onsiteNet = kapıda/kod ile elden tahsil, komisyon sonrası net
// earnings yoksa (eski snapshot) netRevenue'ya düşeriz.
export function trendyolNet(ty: EndOfDayTrendyol | null) {
  if (!ty?.available) return { available: false, bankNet: 0, onsiteNet: 0, total: 0 };
  const e = ty.earnings;
  const bankNet = e?.totalBankNet ?? ty.netRevenue ?? 0;
  const onsiteNet = e?.onDelivery?.bankNet ?? 0;
  return { available: true, bankNet, onsiteNet, total: bankNet + onsiteNet };
}

// Kendi siparişlerin net'i — Komuta'nın "Net (cebe giren)" tanımıyla aynı:
// yemek kartı sağlayıcısı (Multinet, Pluxee…) her ödemeden %10 keser. Kasa sayımı
// brüt üzerinden yapılır (POS brüt gösterir); kesinti yalnız net'te düşülür.
export function ownNet(r: EndOfDayReport) {
  let gross = 0;
  let mealGross = 0;
  for (const x of r.localPaymentBreakdown) {
    gross += x.amount;
    if (x.key === "meal_card") mealGross += x.amount;
  }
  const mealCut = mealGross * MEAL_CARD_PROVIDER_CUT;
  return { gross, mealGross, mealCut, net: gross - mealCut };
}

export const fmtMin = (m: number | null) => (m == null ? "—" : `${Math.round(m)} dk`);
