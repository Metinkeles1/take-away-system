"use client";

import React, { useId, useMemo } from "react";
import { type OrderDraft } from "@/types";
import { formatCurrency, formatPhone } from "@/lib/utils";

interface ThermalReceiptProps {
  draft: OrderDraft;
  total: number;
  subtotal: number;
  orderNumber?: number;
}

const paymentLabels: Record<string, string> = {
  cash: "NAKİT",
  card: "KREDİ/BANKA KARTI",
  online: "ONLINE ÖDEME",
};

const PAPER_WIDTH = "72mm";
const CONTENT_WIDTH = "64mm"; // yazıcı marjinleri hesaba katılmış güvenli alan
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

const ThermalReceipt = React.forwardRef<HTMLDivElement, ThermalReceiptProps>(
  ({ draft, total, subtotal, orderNumber }, ref) => {
    const uniqueId = useId();
    const receiptId = `thermal-receipt-${uniqueId.replace(/:/g, "")}`;

    const printDate = useMemo(() => new Date(), []);
    const dateStr = printDate.toLocaleDateString("tr-TR");
    const timeStr = printDate.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });

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
          ref={ref}
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
                Paket Servis
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
              <span style={{ fontWeight: 700 }}>Sipariş No: #{orderNumber ?? "—"}</span>
              <span style={{ whiteSpace: "nowrap" }}>
                {dateStr} {timeStr}
              </span>
            </div>

            <Divider dashed />

            <SectionTitle>Müşteri Bilgileri</SectionTitle>
            <div style={{ fontSize: FONT_SIZE_NORMAL, lineHeight: 1.45 }}>
              {draft.customer.phone && (
                <div style={{ fontWeight: 700 }}>{formatPhone(draft.customer.phone)}</div>
              )}
              {draft.customer.district && <div>{draft.customer.district}</div>}
              {draft.customer.address && (
                <div style={{ wordBreak: "break-word" }}>{draft.customer.address}</div>
              )}
              {draft.customer.addressDetail && <div>{draft.customer.addressDetail}</div>}
            </div>

            <Divider dashed />

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

            {draft.items.map((item) => (
              <div key={item.product.id} style={{ marginBottom: "4px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 11mm 20mm",
                    columnGap: "2mm",
                    alignItems: "start",
                    fontSize: FONT_SIZE_NORMAL,
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
                    {item.product.name}
                  </span>

                  <span
                    style={{
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    x{item.quantity}
                  </span>

                  <span
                    style={{
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                    }}
                  >
                    {formatCurrency(item.totalPrice)}
                  </span>
                </div>

                {item.note && (
                  <div
                    style={{
                      fontSize: FONT_SIZE_XSMALL,
                      marginTop: "2px",
                      paddingLeft: "2px",
                      wordBreak: "break-word",
                    }}
                  >
                    Not: {item.note}
                  </div>
                )}
              </div>
            ))}

            <Divider />

            <Row left="Ara Toplam" right={formatCurrency(subtotal)} />

            <div
              style={{ borderTop: "2px solid #000", marginTop: "4px", paddingTop: "4px" }}
            >
              <Row left="TOPLAM" right={formatCurrency(total)} bold large />
            </div>

            <Divider dashed />

            <SectionTitle>Ödeme Yöntemi</SectionTitle>
            <div
              style={{
                fontSize: FONT_SIZE_NORMAL,
                fontWeight: 700,
                marginBottom: "4px",
              }}
            >
              {paymentLabels[draft.payment.method ?? ""] ?? "—"}
            </div>

            {draft.notes && (
              <>
                <Divider dashed />
                <SectionTitle>Sipariş Notu</SectionTitle>
                <div
                  style={{
                    fontSize: FONT_SIZE_NORMAL,
                    wordBreak: "break-word",
                  }}
                >
                  {draft.notes}
                </div>
              </>
            )}

            <Divider />

            <div
              style={{
                textAlign: "center",
                fontSize: FONT_SIZE_NORMAL,
                marginTop: "2px",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "2px" }}>Afiyet olsun!</div>
              <div>Bizi tercih ettiğiniz için teşekkürler</div>
              <div style={{ marginTop: "4px", fontSize: FONT_SIZE_XSMALL }}>
                {dateStr} - {timeStr}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  },
);

ThermalReceipt.displayName = "ThermalReceipt";
export default ThermalReceipt;
