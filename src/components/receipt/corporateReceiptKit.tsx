"use client";

import React, { useId, useMemo } from "react";
import { type Voucher } from "@/types";

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

/** "1 Porsiyon" → "1p.", "2 Porsiyon" → "2p." gibi kısaltır. */
export function shortPortion(label?: string): string {
  if (!label) return "";
  return label.replace(/\s*porsiyon/i, "p.").trim();
}

/** "10.06.2026 14:32" formatında yazdırma zamanı (render anına sabitlenir). */
export function usePrintedAt(): string {
  return useMemo(() => {
    const d = new Date();
    return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }, []);
}

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
