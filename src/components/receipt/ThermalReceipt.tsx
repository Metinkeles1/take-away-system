"use client";

import React, { useId, useMemo } from "react";
import { type OrderDraft } from "@/types";
import { formatCurrency, formatPhone } from "@/lib/utils";

interface ThermalReceiptProps {
  draft: OrderDraft;
  total: number;
  subtotal: number;
  deliveryFee: number;
  orderNumber?: number;
}

const paymentLabels: Record<string, string> = {
  cash: "NAKİT",
  card: "KREDİ/BANKA KARTI",
  online: "ONLİNE ÖDEME",
};

// Yatay iki sütunlu satır — sağa taşmayı önler
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
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: "4px",
      fontWeight: bold ? "700" : "400",
      fontSize: large ? "15px" : "12px",
      marginBottom: "2px",
    }}
  >
    <span style={{ flex: "1 1 auto", minWidth: 0 }}>{left}</span>
    <span style={{ flex: "0 0 auto", textAlign: "right", whiteSpace: "nowrap" }}>
      {right}
    </span>
  </div>
);

const Divider = ({ dashed }: { dashed?: boolean }) => (
  <div
    style={{
      borderTop: dashed ? "1px dashed #bbb" : "1px solid #222",
      margin: "6px 0",
    }}
  />
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: "10px",
      fontWeight: "700",
      letterSpacing: "1px",
      color: "#666",
      marginBottom: "4px",
      textTransform: "uppercase" as const,
    }}
  >
    {children}
  </div>
);

const ThermalReceipt = React.forwardRef<HTMLDivElement, ThermalReceiptProps>(
  ({ draft, total, subtotal, deliveryFee, orderNumber }, ref) => {
    const uniqueId = useId();
    const receiptId = `thermal-receipt-${uniqueId.replace(/:/g, "")}`;

    // Fiş oluşturulma anını sabitle — re-render'da değişmesin
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
            body * { visibility: hidden !important; }
            #${receiptId}, #${receiptId} * { visibility: visible !important; }
            #${receiptId} {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              width: 80mm !important;
              zoom: 1 !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: none !important;
            }
            @page { size: 80mm auto; margin: 0; }
          }
        `}</style>

        <div
          id={receiptId}
          ref={ref}
          style={{
            width: "80mm",
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            fontSize: "12px",
            lineHeight: "1.5",
            color: "#111",
            backgroundColor: "#fff",
            padding: "5mm 4mm",
            boxSizing: "border-box",
            border: "1px solid #ddd",
            borderRadius: "4px",
          }}
        >
          {/* ── BAŞLIK ── */}
          <div style={{ textAlign: "center", marginBottom: "6px" }}>
            <div
              style={{
                fontSize: "18px",
                fontWeight: "800",
                letterSpacing: "1px",
                color: "#111",
              }}
            >
              🛵 KONAK KEBAP
            </div>
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              Paket Servis
            </div>
          </div>

          <Divider />

          {/* ── SİPARİŞ NO & TARİH ── */}
          <Row left={`Sipariş No: #${orderNumber ?? "—"}`} right={dateStr} />
          <Row left="" right={timeStr} />

          <Divider dashed />

          {/* ── MÜŞTERİ ── */}
          <SectionTitle>Müşteri Bilgileri</SectionTitle>
          <div style={{ fontSize: "12px", lineHeight: "1.6" }}>
            <div>
              <b>{draft.customer.name || "—"}</b>
            </div>
            {draft.customer.phone && <div>{formatPhone(draft.customer.phone)}</div>}
            {draft.customer.district && (
              <div style={{ color: "#333" }}>{draft.customer.district}</div>
            )}
            {draft.customer.address && (
              <div style={{ wordBreak: "break-word", color: "#333" }}>
                {draft.customer.address}
              </div>
            )}
            {draft.customer.addressDetail && (
              <div style={{ color: "#555" }}>{draft.customer.addressDetail}</div>
            )}
          </div>

          <Divider dashed />

          {/* ── ÜRÜNLER ── */}
          <SectionTitle>Sipariş Kalemleri</SectionTitle>

          {/* Tablo başlık */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "10px",
              fontWeight: "700",
              color: "#666",
              borderBottom: "1px solid #ccc",
              paddingBottom: "3px",
              marginBottom: "4px",
              letterSpacing: "0.5px",
            }}
          >
            <span style={{ flex: "1 1 auto" }}>ÜRÜN</span>
            <span style={{ flex: "0 0 28px", textAlign: "center" }}>AD</span>
            <span style={{ flex: "0 0 60px", textAlign: "right" }}>TUTAR</span>
          </div>

          {/* Ürün satırları */}
          {draft.items.map((item) => (
            <div key={item.product.id} style={{ marginBottom: "4px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "4px",
                  fontSize: "12px",
                }}
              >
                <span
                  style={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    wordBreak: "break-word",
                    fontWeight: "600",
                  }}
                >
                  {item.product.name}
                </span>
                <span style={{ flex: "0 0 28px", textAlign: "center", color: "#444" }}>
                  x{item.quantity}
                </span>
                <span
                  style={{
                    flex: "0 0 60px",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    fontWeight: "600",
                  }}
                >
                  {formatCurrency(item.totalPrice)}
                </span>
              </div>
              {item.note && (
                <div
                  style={{
                    fontSize: "10px",
                    color: "#666",
                    paddingLeft: "4px",
                    marginTop: "1px",
                  }}
                >
                  ↳ {item.note}
                </div>
              )}
            </div>
          ))}

          <Divider />

          {/* ── TUTAR ── */}
          <Row left="Ara Toplam" right={formatCurrency(subtotal)} />
          <Row
            left="Teslimat"
            right={deliveryFee === 0 ? "ÜCRETSİZ" : formatCurrency(deliveryFee)}
          />
          <div
            style={{ borderTop: "2px solid #111", marginTop: "4px", paddingTop: "4px" }}
          >
            <Row left="TOPLAM" right={formatCurrency(total)} bold large />
          </div>

          <Divider dashed />

          {/* ── ÖDEME ── */}
          <SectionTitle>Ödeme Yöntemi</SectionTitle>
          <div style={{ fontSize: "12px", fontWeight: "700", marginBottom: "4px" }}>
            {paymentLabels[draft.payment.method ?? ""] ?? "—"}
          </div>
          {draft.payment.method === "cash" && draft.payment.cashGiven && (
            <>
              <Row left="Verilen" right={formatCurrency(draft.payment.cashGiven)} />
              <Row
                left="Para Üstü"
                right={formatCurrency(Math.max(0, draft.payment.cashGiven - total))}
                bold
              />
            </>
          )}

          {/* ── NOTLAR ── */}
          {draft.notes && (
            <>
              <Divider dashed />
              <SectionTitle>Sipariş Notu</SectionTitle>
              <div style={{ fontSize: "12px", wordBreak: "break-word", color: "#333" }}>
                {draft.notes}
              </div>
            </>
          )}

          <Divider />

          {/* ── ALT BİLGİ ── */}
          <div
            style={{
              textAlign: "center",
              fontSize: "11px",
              color: "#666",
              marginTop: "2px",
            }}
          >
            <div style={{ fontWeight: "700", marginBottom: "2px" }}>Afiyet olsun! 🙏</div>
            <div>Bizi tercih ettiğiniz için teşekkürler</div>
            <div style={{ marginTop: "4px", fontSize: "10px", color: "#999" }}>
              {dateStr} — {timeStr}
            </div>
          </div>
        </div>
      </>
    );
  },
);

ThermalReceipt.displayName = "ThermalReceipt";
export default ThermalReceipt;
