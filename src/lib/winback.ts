// Geri Kazan — bir süredir sipariş vermeyen müşterilere ulaşma sistemi.
// Bu dosya hem sunucuda (actions/winback.ts) hem tarayıcıda kullanılır:
// yalnız tipler, varsayılanlar ve saf yardımcılar (DB erişimi YOK).

// Müşterinin listedeki yeri. İlk üçü "ulaşılacaklar", sonrakiler takip.
// at_risk:    sadık (≥ minOrders) ama alışkanlığının 2 katı süredir yok — erken uyarı
// lapsed:     sadık ve lapsedDays..maxDays gündür sipariş yok — kaybolan
// occasional: az sipariş vermiş (< minOrders) ve lapsedDays..maxDays gündür yok
// contacted:  ulaşıldı, bekleme süresi (waitDays) içinde — dönmesi bekleniyor
// returned:   ulaşıldıktan sonra waitDays içinde sipariş verdi — kazanıldı
// excluded:   ertelendi veya "mesaj istemiyor" — listelerde görünmez
export type WinbackStatus =
  | "at_risk"
  | "lapsed"
  | "occasional"
  | "contacted"
  | "returned"
  | "excluded";

export type WinbackMethod = "whatsapp" | "call";

// Telefon görüşmesinin sonucu. WhatsApp'ta sonuç yok (mesaj gitti = ulaşıldı).
// no_answer: açmadı → ulaşılmış sayılmaz, müşteri listede kalır.
// negative:  istemiyor → müşteri kalıcı olarak hariç tutulur.
export type WinbackCallResult = "positive" | "no_answer" | "negative";

export interface WinbackTemplate {
  id: string;
  title: string;
  text: string;
}

export interface WinbackSettings {
  minOrders: number; // bu kadar ve üstü sipariş = "sadık müşteri"
  lapsedDays: number; // bu kadar gündür sipariş yoksa "kaybolan"
  maxDays: number; // bundan eski müşteriler listelenmez (artık çok soğuk)
  waitDays: number; // ulaştıktan sonra dönüşü bu kadar gün bekle
  templates: WinbackTemplate[];
}

export const DEFAULT_WINBACK_SETTINGS: WinbackSettings = {
  minOrders: 3,
  lapsedDays: 21,
  maxDays: 180,
  waitDays: 14,
  templates: [
    {
      id: "ozledik",
      title: "Sizi özledik",
      text: "Merhaba {ad}, uzun zamandır sizden sipariş alamadık, sizi özledik! 😊 Bu hafta vereceğiniz siparişte %10 indirim sizi bekliyor. Siparişinizi bu numaraya yazabilir ya da arayabilirsiniz.",
    },
    {
      id: "favori",
      title: "Favori ürün + ikram",
      text: "Merhaba {ad}, en sevdiğiniz {urun} bugün de sıcacık hazır! 🔥 Bu hafta vereceğiniz siparişe içeceğiniz bizden ikram.",
    },
    {
      id: "hatir",
      title: "Hatır sorma",
      text: "Merhaba {ad}, {gun} gündür sizden haber alamadık. Son siparişinizde bir sorun mu yaşadınız? Görüşleriniz bizim için çok değerli, yazarsanız çok seviniriz.",
    },
  ],
};

// Ulaşılan kişinin "Geri döndü" sekmesinde kaç gün görüneceği.
export const WINBACK_RETURNED_VISIBLE_DAYS = 60;
// İstatistik penceresi (Ulaşılan / Geri dönen kartları).
export const WINBACK_STATS_DAYS = 30;

export interface WinbackContactView {
  id: string;
  at: string; // ISO
  method: WinbackMethod;
  templateTitle?: string;
  message?: string;
  note?: string;
  result?: WinbackCallResult;
}

export interface WinbackRow {
  key: string; // phoneKey — son 10 hane
  phone: string;
  name: string | null; // gerçek isim (kayıtta telefon yazıyorsa null)
  address: string | null;
  orders: number;
  total: number;
  avgBasket: number;
  monthlyValue: number; // aktif olduğu dönemde ayda ortalama bıraktığı ciro
  lastAt: string; // ISO
  daysSince: number;
  usualGapDays: number | null; // genelde kaç günde bir sipariş verir
  favorites: string[];
  status: WinbackStatus;
  // Hangi listeden geldiği (ulaşıldı/döndü/hariç sekmelerinde de bilinsin).
  segment: "at_risk" | "lapsed" | "occasional" | null;
  lastContact: WinbackContactView | null;
  // Son GERÇEK ulaşma ("açmadı" denemeleri hariç) — istatistik bununla sayılır.
  lastReachedAt: string | null;
  contactCount: number;
  returned: {
    at: string;
    daysAfterContact: number;
    orders: number;
    revenue: number;
  } | null;
  excluded: { optOut: boolean; snoozeUntil: string | null } | null;
}

export interface WinbackStats {
  atRisk: number;
  lapsed: number;
  lapsedMonthlyValue: number;
  occasional: number;
  contacted30: number; // son 30 günde ulaşılan müşteri
  waiting30: number; // bunlardan hâlâ bekleme süresinde olan
  returned30: number;
  returnedRevenue30: number;
  contactedToday: number; // bugün yapılan ulaşma denemesi (açmadı dahil)
}

export interface WinbackBoard {
  settings: WinbackSettings;
  rows: WinbackRow[];
  stats: WinbackStats;
}

// Yeni sipariş ekranı için: bu müşteriye yakın zamanda ulaşıldıysa hatırlatma.
export interface WinbackHint {
  at: string;
  method: WinbackMethod;
  templateTitle?: string;
  message?: string;
  note?: string;
}

// Satırın "değeri": sadık müşteride aylık ortalama ciro; 1-2 siparişlik
// müşteride aylık ortalama anlamsız (tek sipariş = o ayın tamamı) → toplam.
export function winbackValue(row: WinbackRow): { amount: number; label: string } {
  return row.segment === "occasional"
    ? { amount: row.total, label: "toplam harcama" }
    : { amount: row.monthlyValue, label: "aylık ort." };
}

// Sadece ilk isim — "Ahmet Balcı" → "Ahmet". İsim yoksa boş.
export function firstName(name: string | null): string {
  if (!name) return "";
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toLocaleUpperCase("tr-TR") + first.slice(1).toLocaleLowerCase("tr-TR");
}

// Şablondaki {ad}, {urun}, {gun} alanlarını müşteriye göre doldurur. İsim
// yoksa "Merhaba {ad}," → "Merhaba," olacak şekilde boşluk/noktalama toparlanır.
export function fillWinbackTemplate(text: string, row: WinbackRow): string {
  return text
    .replaceAll("{ad}", firstName(row.name))
    .replaceAll("{urun}", row.favorites[0] ?? "favori yemeğiniz")
    .replaceAll("{gun}", String(row.daysSince))
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
