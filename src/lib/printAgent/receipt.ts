// Kasadaki yazıcı programının bastığı Trendyol fişi. Sunucu fişi SATIR listesi
// olarak üretir, program sadece çizer → fiş düzeni değişince programa dokunmak
// gerekmez. Satır tipleri (agents/trendyol-yazici/agent.ps1 ile aynı sözleşme):
//   { k: "t",  x: metin, s: boyut, b: kalın, a: "l" | "c" | "r" }
//   { k: "r",  l: sol metin, r: sağ metin, s, b }   (ürün + fiyat gibi)
//   { k: "hr" }                                      (kesik çizgi)
//   { k: "sp" }                                      (boşluk)
// Boyut (s): 1 normal · 2 orta · 3 büyük · 4 çok büyük.

import type { TrendyolPackage } from "@/lib/integrations/trendyol/client";
import { mapTrendyolPackageToOrder } from "@/lib/integrations/trendyol/courierMap";
import { lineCustomization } from "@/lib/integrations/trendyol/packageUtils";

export type ReceiptLine =
  | { k: "t"; x: string; s?: 1 | 2 | 3 | 4; b?: boolean; a?: "l" | "c" | "r" }
  | { k: "r"; l: string; r: string; s?: 1 | 2 | 3 | 4; b?: boolean }
  | { k: "hr" }
  | { k: "sp" };

const TZ = "Europe/Istanbul";

const money = (n: number) =>
  `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

const clock = (d: Date) =>
  d.toLocaleString("tr-TR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const BRAND: Record<string, string> = {
  pluxee: "Pluxee",
  multinet: "Multinet",
  edenred: "Edenred",
  setcard: "Setcard",
  metropol: "Metropol",
  tokenflex: "Tokenflex",
};

function paymentLines(
  method: string,
  prepaid: boolean | undefined,
  brand: string | undefined,
): { title: string; note: string } {
  const b = brand ? ` (${BRAND[brand] ?? brand})` : "";
  if (prepaid) {
    return {
      title: method === "meal_card" ? `ONLİNE ÖDENDİ · Yemek kartı${b}` : "ONLİNE ÖDENDİ",
      note: "Kapıda tahsilat YOK",
    };
  }
  if (method === "card") return { title: "KAPIDA KREDİ KARTI", note: "POS cihazı götürün" };
  if (method === "meal_card") return { title: `KAPIDA YEMEK KARTI${b}`, note: "Tahsil edilecek" };
  return { title: "KAPIDA NAKİT", note: "Tahsil edilecek" };
}

function deliveryLabel(p: TrendyolPackage): string {
  if (p.storePickupSelected) return "Gel-al (müşteri alacak)";
  return p.deliveryType === "GO" ? "Trendyol kuryesi" : "Kendi kuryemiz";
}

export function buildTrendyolReceipt(
  p: TrendyolPackage,
  opts: { accountName: string; accepted: boolean; prepMinutes?: number; acceptError?: string },
): ReceiptLine[] {
  const o = mapTrendyolPackageToOrder(p);
  const out: ReceiptLine[] = [];

  // İşletme adı en üstte, en büyük — birden çok işletmede fiş karışmasın.
  out.push({ k: "t", x: opts.accountName.toLocaleUpperCase("tr"), s: 4, b: true, a: "c" });
  out.push({ k: "t", x: "TRENDYOL YEMEK", s: 2, b: true, a: "c" });
  out.push({ k: "hr" });

  if (!opts.accepted) {
    out.push({ k: "t", x: "!!! OTOMATİK KABUL EDİLEMEDİ !!!", s: 2, b: true, a: "c" });
    out.push({ k: "t", x: "Trendyol ekranından elle kabul edin.", s: 1, b: true, a: "c" });
    if (opts.acceptError) out.push({ k: "t", x: opts.acceptError.slice(0, 160), s: 1, a: "c" });
    out.push({ k: "hr" });
  }

  out.push({ k: "r", l: `Sipariş #${p.orderNumber}`, r: clock(new Date(p.packageCreationDate)), s: 2, b: true });
  out.push({ k: "r", l: "Teslimat", r: deliveryLabel(p), s: 1 });
  if (opts.accepted && opts.prepMinutes) {
    out.push({ k: "r", l: "Hazırlık süresi", r: `${opts.prepMinutes} dk`, s: 1 });
  }
  out.push({ k: "hr" });

  // Ürünler — miktar × ad, sağda satır toplamı; altında seçim/ekstra/çıkarılan.
  for (const line of p.lines) {
    const qty = line.items?.length || 1;
    const unit = line.unitSellingPrice ?? line.price ?? 0;
    out.push({ k: "r", l: `${qty} x ${line.name}`, r: money(unit * qty), s: 2, b: true });
    const c = lineCustomization(line);
    for (const m of c.modifiers) {
      out.push({ k: "t", x: `   • ${m.name}${m.price ? ` (+${money(m.price)})` : ""}`, s: 1 });
    }
    for (const e of c.extras) {
      out.push({ k: "t", x: `   + ${e.name}${e.price ? ` (+${money(e.price)})` : ""}`, s: 1 });
    }
    for (const r of c.removed) {
      out.push({ k: "t", x: `   – ${r} İSTEMİYOR`, s: 1, b: true });
    }
  }
  out.push({ k: "hr" });

  if (o.notes) {
    out.push({ k: "t", x: "MÜŞTERİ NOTU:", s: 1, b: true });
    out.push({ k: "t", x: o.notes, s: 2, b: true });
    out.push({ k: "hr" });
  }

  out.push({ k: "t", x: o.customer.name, s: 2, b: true });
  if (o.customer.phone) out.push({ k: "t", x: `Tel: ${o.customer.phone}`, s: 1 });
  if (o.callPin) out.push({ k: "t", x: `Arama kodu: ${o.callPin}`, s: 1 });
  if (!p.storePickupSelected) {
    out.push({ k: "t", x: o.customer.address, s: 2 });
    if (o.customer.addressDetail) out.push({ k: "t", x: o.customer.addressDetail, s: 1, b: true });
    if (o.customer.district) out.push({ k: "t", x: o.customer.district, s: 1 });
  }
  out.push({ k: "hr" });

  out.push({ k: "r", l: "TOPLAM", r: money(o.total), s: 3, b: true });
  const pay = paymentLines(o.payment.method, o.payment.prepaid, o.payment.mealCardBrand);
  out.push({ k: "t", x: pay.title, s: 2, b: true, a: "c" });
  out.push({ k: "t", x: pay.note, s: 1, a: "c" });
  out.push({ k: "sp" });

  return out;
}

// ─── İstasyon fişi (Ocakbaşı / Fırın…) ──────────────────────────────────────
// Fiyatsız, büyük yazı: usta yalnız kendi ürünlerini görür. Adres/tutar kasa
// fişinde. Siparişin başka istasyonda da ürünü varsa altta not düşülür ki
// iki taraf birlikte hazırlasın.

export interface StationTicketItem {
  qty: string; // "2" · "1.5 porsiyon" gibi
  name: string;
  details: string[]; // seçimler / ekstralar
  removed: string[]; // "soğan" → "SOĞAN İSTEMİYOR"
  note?: string;
  unmatched?: boolean; // menüde bulunamadı → fişte "(?)"
}

export interface StationTicketOrder {
  source: string; // "PANEL" · "TRENDYOL · Kebapçı X" · "YEMEKSEPETİ"
  number: string;
  createdAt: Date;
  notes?: string;
}

export function buildStationTicket(
  stationName: string,
  order: StationTicketOrder,
  items: StationTicketItem[],
  others: { name: string; count: number }[],
): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  out.push({ k: "t", x: stationName.toLocaleUpperCase("tr"), s: 4, b: true, a: "c" });
  out.push({ k: "t", x: order.source, s: 1, b: true, a: "c" });
  out.push({ k: "hr" });
  out.push({ k: "r", l: `Sipariş #${order.number}`, r: clock(order.createdAt), s: 2, b: true });
  out.push({ k: "hr" });

  for (const it of items) {
    out.push({ k: "t", x: `${it.qty} x ${it.name}${it.unmatched ? " (?)" : ""}`, s: 3, b: true });
    for (const d of it.details) out.push({ k: "t", x: `   • ${d}`, s: 2 });
    for (const r of it.removed) out.push({ k: "t", x: `   – ${r} İSTEMİYOR`, s: 2, b: true });
    if (it.note) out.push({ k: "t", x: `   Not: ${it.note}`, s: 2, b: true });
  }
  out.push({ k: "hr" });

  if (order.notes) {
    out.push({ k: "t", x: "MÜŞTERİ NOTU:", s: 1, b: true });
    out.push({ k: "t", x: order.notes, s: 2, b: true });
    out.push({ k: "hr" });
  }
  for (const o of others) {
    out.push({ k: "t", x: `+ ${o.name}: ${o.count} ürün daha var`, s: 1, b: true, a: "c" });
  }
  out.push({ k: "sp" });
  return out;
}

export function buildStationTestTicket(stationName: string, printerName: string): ReceiptLine[] {
  return [
    { k: "t", x: stationName.toLocaleUpperCase("tr"), s: 4, b: true, a: "c" },
    { k: "t", x: "İSTASYON DENEME FİŞİ", s: 2, b: true, a: "c" },
    { k: "hr" },
    { k: "r", l: "Saat", r: clock(new Date()), s: 1 },
    { k: "r", l: "Yazıcı", r: printerName || "Bilgisayarın varsayılanı", s: 1 },
    { k: "t", x: "Bu istasyonun fişleri buradan çıkacak.", s: 1, a: "c" },
    { k: "sp" },
  ];
}

export function buildTestReceipt(accountNames: string[], printerName: string): ReceiptLine[] {
  const now = new Date();
  return [
    { k: "t", x: "DENEME FİŞİ", s: 4, b: true, a: "c" },
    { k: "hr" },
    { k: "t", x: "Trendyol Yazıcı çalışıyor.", s: 2, b: true, a: "c" },
    { k: "r", l: "Saat", r: clock(now), s: 1 },
    { k: "r", l: "Yazıcı", r: printerName || "Windows varsayılanı", s: 1 },
    { k: "hr" },
    { k: "t", x: "Bağlı işletmeler:", s: 1, b: true },
    ...accountNames.map((n) => ({ k: "t" as const, x: `• ${n}`, s: 2 as const })),
    { k: "hr" },
    { k: "t", x: "Türkçe karakter testi: ğüşıöç ĞÜŞİÖÇ", s: 1, a: "c" },
    { k: "sp" },
  ];
}
