"use client";

import React, { useId, useMemo } from "react";
import { type Voucher, type Corporate, type PeriodStats } from "@/types";
import { formatCurrency, formatPhone } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";

const PAPER_WIDTH = "72mm";
const CONTENT_WIDTH = "64mm";
const FONT_SIZE_NORMAL = "13px";
const FONT_SIZE_XSMALL = "11px";
const FONT_SIZE_LARGE = "16px";

const Row = ({
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
      display: "grid",
      gridTemplateColumns: "1fr auto",
      columnGap: "4px",
      alignItems: "baseline",
      fontWeight: bold ? 700 : 400,
      fontSize: large ? FONT_SIZE_LARGE : FONT_SIZE_NORMAL,
      marginBottom: "2px",
      width: "100%",
    }}
  >
    <span
      style={{
        minWidth: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      {left}
    </span>
    <span
      style={{
        whiteSpace: "nowrap",
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {right}
    </span>
  </div>
);

const Divider = ({ dashed }: { dashed?: boolean }) => (
  <div
    style={{
      borderTop: dashed ? "1px dashed #000" : "1px solid #000",
      margin: "5px 0",
    }}
  />
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: FONT_SIZE_XSMALL,
      fontWeight: 700,
      letterSpacing: "1px",
      color: "#000",
      marginBottom: "3px",
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

export default function MonthlyStatement({
  corporate,
  vouchers,
  stats,
  period,
}: {
  corporate: Corporate;
  vouchers: Voucher[];
  stats: PeriodStats;
  period: string;
}) {
  const uniqueId = useId();
  const receiptId = `monthly-statement-${uniqueId.replace(/:/g, "")}`;

  const printedAt = useMemo(() => {
    const d = new Date();
    return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }, []);

  // Eski → yeni sırala (ekstre tarih sırasına göre okunsun)
  const sortedVouchers = [...vouchers].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return (
    <>
      <style>{`
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: ${PAPER_WIDTH} !important;
          }
          body * { visibility: hidden !important; }
          #${receiptId}, #${receiptId} * { visibility: visible !important; }
          #${receiptId} {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: ${PAPER_WIDTH} !important;
            max-width: ${PAPER_WIDTH} !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          @page { size: 72mm auto; margin: 0; }
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
          fontFamily: "Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace",
          textRendering: "geometricPrecision",
          WebkitFontSmoothing: "none",
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
            fontSize: FONT_SIZE_NORMAL,
            lineHeight: 1.35,
            fontWeight: 400,
          }}
        >
          {/* Başlık */}
          <div style={{ textAlign: "center", marginBottom: "6px" }}>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "1px",
              }}
            >
              KONAK KEBAP
            </div>
            <div style={{ fontSize: FONT_SIZE_NORMAL, marginTop: "2px" }}>
              Aylık Hesap Ekstresi
            </div>
          </div>

          <Divider />

          <div
            style={{
              textAlign: "center",
              fontSize: FONT_SIZE_NORMAL,
              fontWeight: 700,
              marginBottom: "4px",
            }}
          >
            {formatPeriodLabel(period)}
          </div>

          <Divider dashed />

          {/* Kurum bilgisi */}
          <SectionTitle>İşletme</SectionTitle>
          <div style={{ fontSize: FONT_SIZE_NORMAL, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{corporate.name}</div>
            {corporate.phone && (
              <div style={{ fontWeight: 700 }}>{formatPhone(corporate.phone)}</div>
            )}
          </div>

          <Divider dashed />

          {/* Fişler */}
          <SectionTitle>Fişler</SectionTitle>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "10mm 14mm 1fr 20mm",
              columnGap: "1.5mm",
              fontSize: FONT_SIZE_XSMALL,
              fontWeight: 700,
              borderBottom: "1px solid #000",
              paddingBottom: "3px",
              marginBottom: "4px",
            }}
          >
            <span>NO</span>
            <span>TARİH</span>
            <span style={{ textAlign: "center" }}>ADET</span>
            <span style={{ textAlign: "right" }}>TUTAR</span>
          </div>

          {sortedVouchers.length === 0 && (
            <div
              style={{
                fontSize: FONT_SIZE_XSMALL,
                textAlign: "center",
                padding: "8px 0",
              }}
            >
              Bu ayda fiş bulunmuyor.
            </div>
          )}

          {sortedVouchers.map((v) => {
            const d = new Date(v.date);
            const dateShort = `${String(d.getDate()).padStart(2, "0")}.${String(
              d.getMonth() + 1,
            ).padStart(2, "0")}`;
            return (
              <div key={v.id} style={{ marginBottom: "3px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "10mm 14mm 1fr 20mm",
                    columnGap: "1.5mm",
                    fontSize: FONT_SIZE_NORMAL,
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>#{v.voucherNumber}</span>
                  <span style={{ whiteSpace: "nowrap" }}>{dateShort}</span>
                  <span
                    style={{
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {v.billingType === "per_person"
                      ? `x${v.personCount ?? 0}`
                      : `${(v.items ?? []).reduce((s, it) => s + it.quantity, 0)} ürün`}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                    }}
                  >
                    {formatCurrency(v.total)}
                  </span>
                </div>
                {v.note && (
                  <div
                    style={{
                      fontSize: FONT_SIZE_XSMALL,
                      paddingLeft: "10mm",
                      wordBreak: "break-word",
                    }}
                  >
                    {v.note}
                  </div>
                )}
              </div>
            );
          })}

          <Divider />

          {/* Özet */}
          <Row left={`Fiş Sayısı (${stats.count})`} right={formatCurrency(stats.total)} />
          <Row left="Tahsil Edilen" right={formatCurrency(stats.paid)} />
          <Row left="Açık Bakiye" right={formatCurrency(stats.unpaid)} bold />

          <div
            style={{ borderTop: "2px solid #000", marginTop: "4px", paddingTop: "4px" }}
          >
            <Row left="GENEL TOPLAM" right={formatCurrency(stats.total)} bold large />
          </div>

          <Divider dashed />

          {/* İmza alanı */}
          <div style={{ fontSize: FONT_SIZE_XSMALL, marginTop: "8px" }}>
            <div style={{ marginBottom: "16px" }}>Tahsil Eden / Alan</div>
            <div
              style={{
                borderTop: "1px solid #000",
                paddingTop: "2px",
                textAlign: "center",
              }}
            >
              Ad Soyad / İmza
            </div>
          </div>

          <Divider />

          <div
            style={{
              textAlign: "center",
              fontSize: FONT_SIZE_XSMALL,
              marginTop: "2px",
            }}
          >
            Yazdırılma: {printedAt}
          </div>
        </div>
      </div>
    </>
  );
}
