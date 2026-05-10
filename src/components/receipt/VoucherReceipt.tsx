"use client";

import React, { useId, useMemo } from "react";
import { type Voucher } from "@/types";
import { formatCurrency } from "@/lib/utils";

const PAPER_WIDTH = "72mm";
const CONTENT_WIDTH = "64mm";

const Line = () => (
  <div style={{ borderTop: "1px solid #000", margin: "2mm 0" }} />
);

const DoubleLine = () => (
  <div
    style={{
      borderTop: "1px solid #000",
      borderBottom: "1px solid #000",
      height: "1.5mm",
      margin: "2mm 0",
    }}
  />
);

// Hizalanmış label : value satırı (label sabit genişlikte)
const Field = ({ label, value }: { label: string; value: string }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "26mm 1fr",
      columnGap: "2mm",
      fontSize: "12px",
      lineHeight: 1.6,
    }}
  >
    <span>{label}</span>
    <span style={{ fontWeight: 600, wordBreak: "break-word" }}>{value}</span>
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
            background: #fff !important;
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
          border: "1px solid #ddd",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, Helvetica, sans-serif",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            width: CONTENT_WIDTH,
            maxWidth: CONTENT_WIDTH,
            margin: "0 auto",
            padding: "4mm 0",
            boxSizing: "border-box",
            fontSize: "12px",
            lineHeight: 1.5,
          }}
        >
          {/* Başlık */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "1px",
              }}
            >
              KONAK KEBAP
            </div>
            <div style={{ fontSize: "11px", marginTop: "0.5mm" }}>
              Teslim Fişi
            </div>
          </div>

          <DoubleLine />

          {/* Fiş bilgileri */}
          <Field label="Fiş No" value={`#${voucher.voucherNumber}`} />
          <Field label="Tarih" value={dateStr} />

          <Line />

          {/* İşletme */}
          <Field label="İşletme" value={voucher.corporateName} />

          <Line />

          {/* Detay */}
          {voucher.billingType === "per_person" ? (
            <>
              <Field label="Kişi Sayısı" value={String(voucher.personCount ?? 0)} />
              <Field
                label="Birim Fiyat"
                value={formatCurrency(voucher.pricePerPerson ?? 0)}
              />
            </>
          ) : (
            <div style={{ fontSize: "12px", lineHeight: 1.5 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 8mm 18mm",
                  columnGap: "2mm",
                  fontSize: "10px",
                  fontWeight: 700,
                  borderBottom: "1px solid #000",
                  paddingBottom: "1mm",
                  marginBottom: "1mm",
                  textTransform: "uppercase",
                }}
              >
                <span>Ürün</span>
                <span style={{ textAlign: "center" }}>Ad</span>
                <span style={{ textAlign: "right" }}>Tutar</span>
              </div>
              {(voucher.items ?? []).map((it, idx) => (
                <div
                  key={`${it.productId}-${idx}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 8mm 18mm",
                    columnGap: "2mm",
                    alignItems: "baseline",
                    padding: "0.5mm 0",
                  }}
                >
                  <span style={{ wordBreak: "break-word", fontWeight: 600 }}>
                    {it.name}
                    {it.portionLabel && (
                      <span style={{ fontWeight: 400, fontSize: "10px" }}>
                        {" "}
                        ({it.portionLabel})
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: "center" }}>x{it.quantity}</span>
                  <span
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                    }}
                  >
                    {formatCurrency(it.totalPrice)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {voucher.note && (
            <div style={{ marginTop: "1mm" }}>
              <Field label="Açıklama" value={voucher.note} />
            </div>
          )}

          <DoubleLine />

          {/* Toplam */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "26mm 1fr",
              columnGap: "2mm",
              alignItems: "baseline",
              fontSize: "14px",
              fontWeight: 700,
              padding: "1mm 0",
            }}
          >
            <span>TOPLAM</span>
            <span
              style={{
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatCurrency(voucher.total)}
            </span>
          </div>

          <DoubleLine />
        </div>
      </div>
    </>
  );
}
