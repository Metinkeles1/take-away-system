import { ArrowRightLeft, Banknote, Coins, CreditCard, Globe, Ticket, type LucideIcon } from "lucide-react";

import type { EndOfDayOrder, EndOfDayTrendyol } from "@/actions/endOfDay";

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
}

export const NO_COURIER = "__none__";

export function matchesFilter(o: EndOfDayOrder, f: OrderFilter, targetMin: number): boolean {
  const sc = f.scope;
  if (sc?.channel && o.channel !== sc.channel) return false;
  if (sc?.methods && !sc.methods.includes(o.method)) return false;
  if (sc?.brand && (o.mealCardBrand ?? "Belirtilmemiş") !== sc.brand) return false;
  if (sc?.onDoor != null && o.onDoor !== sc.onDoor) return false;
  if (f.courier && (o.courier ?? NO_COURIER) !== f.courier) return false;
  if (f.state === "cancelled" && o.status !== "cancelled") return false;
  if (f.state === "open" && !o.open) return false;
  if (f.state === "late" && !isLate(o, targetMin)) return false;
  // İptaller yalnız "İptal" filtresinde görünür — aksi halde toplamları şişirir.
  if (f.state !== "cancelled" && o.status === "cancelled") return false;
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

export const fmtMin = (m: number | null) => (m == null ? "—" : `${Math.round(m)} dk`);
