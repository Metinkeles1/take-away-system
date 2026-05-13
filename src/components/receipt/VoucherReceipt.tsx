"use client";

import React, { useId, useMemo } from "react";
import { type Voucher } from "@/types";
import { formatCurrency } from "@/lib/utils";

const PAPER_WIDTH = "72mm";
const CONTENT_WIDTH = "64mm";
const FONT_SIZE_NORMAL = "15px";
const FONT_SIZE_XSMALL = "13px";
const FONT_SIZE_LARGE = "19px";

const Divider = ({ dashed }: { dashed?: boolean }) => (
  <div
    style={{
      borderTop: dashed ? "1px dashed #000" : "1px solid #000",
      margin: "3px 0",
    }}
  />
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: FONT_SIZE_XSMALL,
      fontWeight: 700,
      letterSpacing: "1px",
      marginBottom: "3px",
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

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

export default function VoucherReceipt({ voucher }: { voucher: Voucher }) {
  const uniqueId = useId();
  const receiptId = `voucher-receipt-${uniqueId.replace(/:/g, "")}`;

  const dateStr = useMemo(
    () => new Date(voucher.date).toLocaleDateString("tr-TR"),
    [voucher.date],
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

          body * {
            visibility: hidden !important;
          }

          #${receiptId}, #${receiptId} * {
            visibility: visible !important;
          }

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

          @page {
            size: 72mm auto;
            margin: 0;
          }
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
          fontFamily:
            "Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace",
          textRendering: "geometricPrecision",
          WebkitFontSmoothing: "none",
        }}
      >
        <div
          style={{
            width: CONTENT_WIDTH,
            maxWidth: CONTENT_WIDTH,
            margin: "0 auto",
            padding: "2mm 0",
            boxSizing: "border-box",
            fontSize: FONT_SIZE_NORMAL,
            lineHeight: 1.3,
            fontWeight: 400,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "4px" }}>
            <div
              style={{
                fontSize: "17px",
                fontWeight: 700,
                letterSpacing: "1px",
              }}
            >
              KONAK KEBAP
            </div>
            <div style={{ fontSize: FONT_SIZE_NORMAL, marginTop: "2px" }}>
              Kurumsal Teslim Fişi
            </div>
          </div>

          <Divider />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontSize: FONT_SIZE_NORMAL,
              marginBottom: "2px",
            }}
          >
            <span style={{ fontWeight: 700 }}>
              Fiş No: #{voucher.voucherNumber}
            </span>
            <span style={{ whiteSpace: "nowrap" }}>{dateStr}</span>
          </div>

          <Divider dashed />

          <SectionTitle>İşletme</SectionTitle>
          <div
            style={{
              fontSize: FONT_SIZE_NORMAL,
              fontWeight: 700,
              wordBreak: "break-word",
              lineHeight: 1.3,
            }}
          >
            {voucher.corporateName}
          </div>

          <Divider dashed />

          {voucher.billingType === "per_person" ? (
            <>
              <SectionTitle>Detay</SectionTitle>
              <Row
                left={`Kişi x${voucher.personCount ?? 0}`}
                right={formatCurrency(voucher.pricePerPerson ?? 0)}
              />
            </>
          ) : (
            <>
              <SectionTitle>Sipariş Kalemleri</SectionTitle>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 11mm 20mm",
                  columnGap: "2mm",
                  fontSize: FONT_SIZE_XSMALL,
                  fontWeight: 700,
                  borderBottom: "1px solid #000",
                  paddingBottom: "3px",
                  marginBottom: "4px",
                }}
              >
                <span>ÜRÜN</span>
                <span style={{ textAlign: "center" }}>AD</span>
                <span style={{ textAlign: "right" }}>TUTAR</span>
              </div>
              {(voucher.items ?? []).map((it, idx) => (
                <div
                  key={`${it.productId}-${idx}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 11mm 20mm",
                    columnGap: "2mm",
                    alignItems: "start",
                    fontSize: FONT_SIZE_NORMAL,
                    marginBottom: "4px",
                  }}
                >
                  <span
                    style={{
                      minWidth: 0,
                      whiteSpace: "normal",
                      overflowWrap: "break-word",
                      lineHeight: 1.25,
                      fontWeight: 700,
                    }}
                  >
                    {it.name}
                    {it.portionLabel && (
                      <span style={{ fontWeight: 400, fontSize: "0.85em" }}>
                        {" "}
                        ({it.portionLabel})
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    x{it.quantity}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                    }}
                  >
                    {formatCurrency(it.totalPrice)}
                  </span>
                </div>
              ))}
            </>
          )}

          <Divider />

          <div
            style={{
              borderTop: "2px solid #000",
              marginTop: "4px",
              paddingTop: "4px",
            }}
          >
            <Row left="TOPLAM" right={formatCurrency(voucher.total)} bold large />
          </div>

          {voucher.note && (
            <>
              <Divider dashed />
              <SectionTitle>Açıklama</SectionTitle>
              <div
                style={{
                  fontSize: FONT_SIZE_NORMAL,
                  wordBreak: "break-word",
                }}
              >
                {voucher.note}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
