"use client";

import React, { useId, useMemo, useSyncExternalStore } from "react";
import { type Voucher, type PeriodStats } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { currentPeriod, formatPeriodLabel } from "@/lib/period";

/**
 * Termal yazıcı dostu ortak fiş primitifleri.
 * Tasarım kararları (ucuz termal POS'larda okunaklılık için):
 * - Tüm metin kalın (>=600). İnce çizgiler termal kafada soluk/kopuk çıkar.
 * - Daha büyük punto + geniş içerik alanı → daha az satır kaydırma, kesilme yok.
 * - Hiçbir yerde ellipsis/nowrap kırpma yok; uzun isimler alt satıra sarar.
 * - Antialiasing açık (none değil) → çizgiler dolu görünür.
 */

export const PAPER_WIDTH = "72mm";
export const CONTENT_WIDTH = "68mm"; // 64 yerine daha geniş güvenli alan
export const FS_NORMAL = "15px";
export const FS_SMALL = "13px";
export const FS_LARGE = "22px";
const FONT_STACK =
  "'Arial', 'Helvetica Neue', Helvetica, 'Segoe UI', sans-serif";

export const Row = ({
  left,
  right,
  bold,
  large,
}: {
  left: string;
  right: string;
  bold?: boolean;
  large?: boolean;
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      gap: "6px",
      alignItems: "baseline",
      fontWeight: bold || large ? 800 : 600,
      fontSize: large ? FS_LARGE : FS_NORMAL,
      marginBottom: "3px",
      width: "100%",
    }}
  >
    <span style={{ minWidth: 0, overflowWrap: "break-word" }}>{left}</span>
    <span
      style={{
        whiteSpace: "nowrap",
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        flexShrink: 0,
      }}
    >
      {right}
    </span>
  </div>
);

export const Divider = ({ dashed }: { dashed?: boolean }) => (
  <div
    style={{
      borderTop: dashed ? "2px dashed #000" : "2px solid #000",
      margin: "6px 0",
    }}
  />
);

/**
 * Fiş yazdırma filtreleri: kullanıcı hangi tutar alanlarının basılacağını seçer.
 * MonthlyStatement (gün gün) ve ProductSummaryReceipt (ürün bazlı) ortak kullanır.
 */
/**
 * Ödeme durumu kapsamı:
 *  - all: tüm fişler (işaretsiz)
 *  - open: yalnızca açık (tam ödenmemiş) fişler → o an ödenmesi gereken
 *  - marked: tüm fişler, ödenenlerin yanına ✓ (yalnızca gün gün ekstrede anlamlı;
 *            ürün özetinde fiş bazlı ödeme olduğundan "all" gibi davranır)
 */
export type PaymentScope = "all" | "open" | "paid" | "marked";

export interface ReceiptOptions {
  monthly: boolean; // aylık özet bölümü (hangi ay kaç fiş / ne kadar)
  lines: boolean; // liste: ekstrede gün satırları, ürün özetinde ürün satırları
  itemPrices: boolean; // ürün özeti: satır tutarı · ekstre: gün altındaki ürün dökümü
  unitPrice: boolean; // ürün özeti: "3 ad. × 120 ₺" birim fiyat
  counts: boolean; // fiş sayısı / çeşit + toplam adet satırları
  total: boolean; // toplam tutar
  paid: boolean; // tahsil edilen (ödenmiş) tutar
  unpaid: boolean; // açık bakiye / kalan borç
  signature: boolean; // ekstre: imza alanı
  scope: PaymentScope; // hangi ödeme durumundaki fişler basılsın
}

export const DEFAULT_RECEIPT_OPTIONS: ReceiptOptions = {
  monthly: false,
  lines: true,
  itemPrices: true,
  unitPrice: false,
  counts: true,
  total: true,
  paid: true,
  unpaid: true,
  signature: true,
  scope: "all",
};

/** ReceiptOptions'ın yalnızca boolean (göster/gizle) alanları. */
export type ReceiptToggleKey = Exclude<keyof ReceiptOptions, "scope">;

export interface ReceiptOptionDef {
  key: ReceiptToggleKey;
  label: string;
  // Bu seçenek yalnızca verilen seçenek açıkken anlamlı (kapalıysa pasif görünür).
  dependsOn?: ReceiptToggleKey;
}

/** Hazır şablon: tek tıkla tüm tikleri ayarlar (ödeme durumu filtresine dokunmaz). */
export interface ReceiptPreset {
  label: string;
  values: Partial<Omit<ReceiptOptions, "scope">>;
}

export const RECEIPT_OPTION_DEFS: ReceiptOptionDef[] = [
  { key: "itemPrices", label: "Ürün fiyatları" },
  { key: "total", label: "Toplam tutar" },
  { key: "paid", label: "Tahsil edilen" },
  { key: "unpaid", label: "Açık bakiye" },
];

/** Ürün özeti fişinin tikleri. */
export const PRODUCT_OPTION_DEFS: ReceiptOptionDef[] = [
  { key: "monthly", label: "Aylık özet" },
  { key: "lines", label: "Ürün listesi" },
  { key: "itemPrices", label: "Ürün tutarları", dependsOn: "lines" },
  { key: "unitPrice", label: "Birim fiyat", dependsOn: "lines" },
  { key: "counts", label: "Adet özeti" },
  { key: "paid", label: "Tahsil edilen" },
  { key: "unpaid", label: "Açık bakiye" },
  { key: "total", label: "Genel toplam" },
];

export const PRODUCT_PRESETS: ReceiptPreset[] = [
  {
    label: "Tam döküm",
    values: { monthly: false, lines: true, itemPrices: true, unitPrice: true, counts: true, paid: true, unpaid: true, total: true },
  },
  {
    label: "Sadece adetler",
    values: { monthly: false, lines: true, itemPrices: false, unitPrice: false, counts: true, paid: false, unpaid: false, total: false },
  },
  {
    label: "Aylık özet",
    values: { monthly: true, lines: false, itemPrices: false, unitPrice: false, counts: true, paid: false, unpaid: true, total: true },
  },
  {
    label: "Sadece borç",
    values: { monthly: false, lines: false, itemPrices: false, unitPrice: false, counts: false, paid: false, unpaid: true, total: false },
  },
];

/** Aylık ekstre fişinin tikleri. */
export const STATEMENT_OPTION_DEFS: ReceiptOptionDef[] = [
  { key: "monthly", label: "Aylık özet" },
  { key: "lines", label: "Gün listesi" },
  { key: "itemPrices", label: "Ürün detayı", dependsOn: "lines" },
  { key: "counts", label: "Fiş sayısı" },
  { key: "total", label: "Toplam" },
  { key: "paid", label: "Ödenen" },
  { key: "unpaid", label: "Kalan borç" },
  { key: "signature", label: "İmza alanı" },
];

export const STATEMENT_PRESETS: ReceiptPreset[] = [
  {
    label: "Tam döküm",
    values: { monthly: false, lines: true, itemPrices: true, counts: true, total: true, paid: true, unpaid: true, signature: true },
  },
  {
    label: "Günlük tutarlar",
    values: { monthly: false, lines: true, itemPrices: false, counts: true, total: true, paid: true, unpaid: true, signature: true },
  },
  {
    label: "Aylık özet",
    values: { monthly: true, lines: false, itemPrices: false, counts: true, total: true, paid: true, unpaid: true, signature: true },
  },
  {
    label: "Sadece borç",
    values: { monthly: false, lines: false, itemPrices: false, counts: false, total: false, paid: false, unpaid: true, signature: true },
  },
];

export const PAYMENT_SCOPE_DEFS: { value: PaymentScope; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "open", label: "Sadece açık" },
  { value: "marked", label: "Ödenenleri işaretle" },
];

/** Aylık ekstre için ödeme durumu filtresi: tümü / sadece ödenen / sadece açık. */
export const STATEMENT_SCOPE_DEFS: { value: PaymentScope; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "paid", label: "Sadece ödenen" },
  { value: "open", label: "Sadece açık" },
];

/** Ödeme durumu kapsamına göre fişleri süzer. "open" → açık, "paid" → ödenmiş. */
export function filterVouchersByScope(
  vouchers: Voucher[],
  scope: PaymentScope,
): Voucher[] {
  if (scope === "open") return vouchers.filter((v) => !v.paid);
  if (scope === "paid") return vouchers.filter((v) => v.paid);
  return vouchers;
}

/** Verilen fiş alt kümesinden dönem istatistiği hesaplar (süzme sonrası tutarlılık için). */
export function computeVoucherStats(vouchers: Voucher[]): PeriodStats {
  let total = 0;
  let paid = 0;
  for (const v of vouchers) {
    total += v.total;
    paid += v.paidAmount;
  }
  return { count: vouchers.length, total, paid, unpaid: total - paid };
}

/** Bir dönemin tüm fişlerini ürün + porsiyon bazında toplar (gün gün değil). */
export interface AggregatedProduct {
  key: string;
  name: string;
  portionLabel?: string;
  quantity: number;
  total: number;
}

export function aggregateVoucherProducts(vouchers: Voucher[]): {
  products: AggregatedProduct[];
  totalQty: number;
  personCount: number;
} {
  const map = new Map<string, AggregatedProduct>();
  let personCount = 0;
  for (const v of vouchers) {
    if (v.billingType === "per_person") {
      personCount += v.personCount ?? 0;
      continue;
    }
    for (const it of v.items ?? []) {
      const key = `${it.productId}|${it.portionLabel ?? ""}`;
      const ex = map.get(key);
      if (ex) {
        ex.quantity += it.quantity;
        ex.total += it.totalPrice;
      } else {
        map.set(key, {
          key,
          name: it.name,
          portionLabel: it.portionLabel,
          quantity: it.quantity,
          total: it.totalPrice,
        });
      }
    }
  }
  const products = [...map.values()].sort((a, b) => b.quantity - a.quantity);
  const totalQty = products.reduce((s, p) => s + p.quantity, 0);
  return { products, totalQty, personCount };
}

/** Bir ayın özeti (aylık özet bölümü için). */
export interface MonthBucket {
  period: string; // "YYYY-MM"
  count: number; // fiş sayısı
  quantity: number; // ürün adedi (ürün bazlı fişler)
  persons: number; // kişi sayısı (kişi bazlı fişler)
  total: number;
  paid: number;
  unpaid: number;
}

/** Fişleri aylara göre gruplar (eski → yeni). */
export function groupVouchersByMonth(vouchers: Voucher[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const v of vouchers) {
    const key = currentPeriod(new Date(v.date));
    let b = map.get(key);
    if (!b) {
      b = { period: key, count: 0, quantity: 0, persons: 0, total: 0, paid: 0, unpaid: 0 };
      map.set(key, b);
    }
    b.count += 1;
    b.total += v.total;
    b.paid += v.paidAmount;
    b.unpaid += v.total - v.paidAmount;
    if (v.billingType === "per_person") b.persons += v.personCount ?? 0;
    else for (const it of v.items ?? []) b.quantity += it.quantity;
  }
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * "Aylık Özet" bölümü: her ay için tutar + alt satırda fiş/adet ve kalan.
 * showQuantity → ürün özetinde adet/kişi; showUnpaid → kalan borç etiketi.
 */
export function MonthlyBreakdown({
  vouchers,
  showQuantity,
  showUnpaid,
}: {
  vouchers: Voucher[];
  showQuantity?: boolean;
  showUnpaid?: boolean;
}) {
  const months = groupVouchersByMonth(vouchers);
  if (months.length === 0) return null;
  return (
    <>
      <SectionTitle>Aylık Özet</SectionTitle>
      {months.map((m, i) => {
        const last = i === months.length - 1;
        const parts = [`${m.count} fiş`];
        if (showQuantity && m.quantity > 0) parts.push(`${m.quantity} ad.`);
        if (showQuantity && m.persons > 0) parts.push(`${m.persons} kişi`);
        if (showUnpaid) {
          parts.push(
            m.unpaid <= 0.005 ? "Ödendi" : `Kalan ${formatCurrency(m.unpaid)}`,
          );
        }
        return (
          <div
            key={m.period}
            style={{
              marginBottom: last ? "0" : "5px",
              paddingBottom: last ? "0" : "5px",
              borderBottom: last ? "none" : "1px dashed #bbb",
            }}
          >
            <Row left={formatPeriodLabel(m.period)} right={formatCurrency(m.total)} bold />
            <div style={{ fontSize: FS_SMALL, fontWeight: 700 }}>
              {parts.join(" · ")}
            </div>
          </div>
        );
      })}
      <Divider />
    </>
  );
}

/** "1 Porsiyon" → "1p.", "2 Porsiyon" → "2p." gibi kısaltır. */
export function shortPortion(label?: string): string {
  if (!label) return "";
  return label.replace(/\s*porsiyon/i, "p.").trim();
}

/**
 * "10.06.2026 14:32" formatında yazdırma zamanı (ilk çizime sabitlenir).
 * Sadece tarayıcıda hesaplanır: sunucuda (UTC, farklı an) hesaplanırsa metin
 * tarayıcıdakiyle tutmaz → React #418. SSR snapshot "" döner.
 */
export function usePrintedAt(): string {
  const getSnapshot = useMemo(() => {
    let cached: string | null = null;
    return () =>
      (cached ??= (() => {
        const d = new Date();
        const tz = { timeZone: "Europe/Istanbul" } as const;
        return `${d.toLocaleDateString("tr-TR", tz)} ${d.toLocaleTimeString("tr-TR", {
          ...tz,
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      })());
  }, []);
  return useSyncExternalStore(noopSubscribe, getSnapshot, () => "");
}

const noopSubscribe = () => () => {};

export const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: FS_SMALL,
      fontWeight: 800,
      letterSpacing: "1px",
      color: "#000",
      marginBottom: "4px",
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

/**
 * Fişin dış kabuğu: print stilleri + 72mm kağıt + ortalı içerik alanı.
 * Her fiş bunu sarmalayıp içine kendi gövdesini koyar.
 */
export function ReceiptShell({ children }: { children: React.ReactNode }) {
  const uniqueId = useId();
  const receiptId = `thermal-${uniqueId.replace(/:/g, "")}`;

  return (
    <>
      <style>{`
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: ${PAPER_WIDTH} !important;
            background: #fff !important;
          }
          #${receiptId} {
            width: ${PAPER_WIDTH} !important;
            max-width: ${PAPER_WIDTH} !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            box-sizing: border-box !important;
          }
          @page { size: ${PAPER_WIDTH} auto; margin: 0; }
        }
      `}</style>

      <div
        id={receiptId}
        style={{
          width: PAPER_WIDTH,
          maxWidth: PAPER_WIDTH,
          backgroundColor: "#fff",
          color: "#000",
          boxSizing: "border-box",
          overflow: "hidden",
          border: "1px solid #ddd",
          padding: "0",
          fontFamily: FONT_STACK,
          WebkitFontSmoothing: "antialiased",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            width: CONTENT_WIDTH,
            maxWidth: CONTENT_WIDTH,
            margin: "0 auto",
            padding: "3mm 0",
            boxSizing: "border-box",
            fontSize: FS_NORMAL,
            lineHeight: 1.4,
            fontWeight: 600,
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * Genel toplam bloğu: kalın çerçeveli, ortalı. Etiket üstte küçük,
 * tutar altta büyük → uzun tutarlarda bile yan yana kayıp kırpma olmaz.
 */
export function GrandTotal({
  label = "GENEL TOPLAM",
  amount,
}: {
  label?: string;
  amount: string;
}) {
  return (
    <div
      style={{
        border: "3px solid #000",
        padding: "6px 4px",
        marginTop: "6px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: FS_SMALL, fontWeight: 800, letterSpacing: "1.5px" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: FS_LARGE,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          marginTop: "3px",
          lineHeight: 1.1,
        }}
      >
        {amount}
      </div>
    </div>
  );
}

/** Ortak başlık: işletme adı + fiş tipi alt başlığı. */
export function ReceiptHeader({ subtitle }: { subtitle: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: "6px" }}>
      <div
        style={{
          fontSize: "18px",
          fontWeight: 800,
          letterSpacing: "1px",
        }}
      >
        KONAK KEBAP
      </div>
      <div style={{ fontSize: FS_NORMAL, marginTop: "2px", fontWeight: 700 }}>
        {subtitle}
      </div>
    </div>
  );
}
