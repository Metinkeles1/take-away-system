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
        {/* Yazdırma stili - sadece yazdırma sırasında uygulanır */}
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #${receiptId}, #${receiptId} * { visibility: visible !important; }
            #${receiptId} {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              width: 80mm !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
            }
            @page {
              size: 80mm 210mm;
              margin: 0;
            }
          }
        `}</style>

        <div
          id={receiptId}
          ref={ref}
          style={{
            width: "80mm",
            minHeight: "210mm",
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: "11px",
            lineHeight: "1.4",
            color: "#000",
            backgroundColor: "#fff",
            padding: "4mm 3mm",
            boxSizing: "border-box",
            border: "1px dashed #ccc",
          }}
        >
          {/* Başlık */}
          <div style={{ textAlign: "center", marginBottom: "3mm" }}>
            <div style={{ fontSize: "16px", fontWeight: "bold", letterSpacing: "2px" }}>
              🛵 PAKETSİPARİŞ
            </div>
            <div style={{ fontSize: "10px", marginTop: "1mm" }}>Paket Servis Sistemi</div>
            <div style={{ borderBottom: "1px dashed #000", margin: "2mm 0" }} />
          </div>

          {/* Sipariş No & Tarih */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "1mm",
              fontSize: "10px",
            }}
          >
            <span>
              <b>SİP NO:</b> #{orderNumber ?? "—"}
            </span>
            <span>{dateStr}</span>
          </div>
          <div style={{ textAlign: "right", fontSize: "10px", marginBottom: "2mm" }}>
            {timeStr}
          </div>

          <div style={{ borderBottom: "1px dashed #000", margin: "2mm 0" }} />

          {/* Müşteri Bilgisi */}
          <div style={{ marginBottom: "2mm" }}>
            <div style={{ fontWeight: "bold", fontSize: "10px", marginBottom: "1mm" }}>
              MÜŞTERİ BİLGİSİ
            </div>
            <div>Ad: {draft.customer.name || "—"}</div>
            <div>
              Tel: {draft.customer.phone ? formatPhone(draft.customer.phone) : "—"}
            </div>
            {draft.customer.district && <div>İlçe: {draft.customer.district}</div>}
            <div style={{ wordBreak: "break-word" }}>
              Adres: {draft.customer.address || "—"}
            </div>
            {draft.customer.addressDetail && (
              <div>Daire/Kat: {draft.customer.addressDetail}</div>
            )}
          </div>

          <div style={{ borderBottom: "1px dashed #000", margin: "2mm 0" }} />

          {/* Ürünler */}
          <div style={{ marginBottom: "1mm" }}>
            <div style={{ fontWeight: "bold", fontSize: "10px", marginBottom: "1mm" }}>
              SİPARİŞ KALEMLERİ
            </div>

            {/* Başlık satırı */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: "2mm",
                fontWeight: "bold",
                fontSize: "10px",
                borderBottom: "1px solid #000",
                paddingBottom: "1mm",
                marginBottom: "1mm",
              }}
            >
              <span>ÜRÜN</span>
              <span style={{ textAlign: "center" }}>AD</span>
              <span style={{ textAlign: "right" }}>TUTAR</span>
            </div>

            {/* Ürün satırları */}
            {draft.items.map((item) => (
              <div key={item.product.id} style={{ marginBottom: "1mm" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: "2mm",
                    fontSize: "10px",
                  }}
                >
                  <span style={{ wordBreak: "break-word" }}>{item.product.name}</span>
                  <span style={{ textAlign: "center" }}>{item.quantity}</span>
                  <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatCurrency(item.totalPrice)}
                  </span>
                </div>
                {item.note && (
                  <div style={{ fontSize: "9px", color: "#555", paddingLeft: "2mm" }}>
                    ↳ {item.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ borderBottom: "1px dashed #000", margin: "2mm 0" }} />

          {/* Tutar özeti */}
          <div style={{ fontSize: "10px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5mm",
              }}
            >
              <span>Ara Toplam:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5mm",
              }}
            >
              <span>Teslimat:</span>
              <span>{deliveryFee === 0 ? "ÜCRETSİZ" : formatCurrency(deliveryFee)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: "bold",
                fontSize: "13px",
                borderTop: "1px solid #000",
                paddingTop: "1mm",
                marginTop: "1mm",
              }}
            >
              <span>TOPLAM:</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div style={{ borderBottom: "1px dashed #000", margin: "2mm 0" }} />

          {/* Ödeme bilgisi */}
          <div style={{ fontSize: "10px", marginBottom: "2mm" }}>
            <div style={{ fontWeight: "bold", marginBottom: "0.5mm" }}>ÖDEME</div>
            <div>{paymentLabels[draft.payment.method ?? ""] ?? "—"}</div>
            {draft.payment.method === "cash" && draft.payment.cashGiven && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Verilen:</span>
                  <span>{formatCurrency(draft.payment.cashGiven)}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: "bold",
                  }}
                >
                  <span>Para Üstü:</span>
                  <span>
                    {formatCurrency(Math.max(0, draft.payment.cashGiven - total))}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Sipariş notu */}
          {draft.notes && (
            <>
              <div style={{ borderBottom: "1px dashed #000", margin: "2mm 0" }} />
              <div style={{ fontSize: "10px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "0.5mm" }}>NOT:</div>
                <div style={{ wordBreak: "break-word" }}>{draft.notes}</div>
              </div>
            </>
          )}

          <div style={{ borderBottom: "1px dashed #000", margin: "2mm 0" }} />

          {/* Alt bilgi */}
          <div style={{ textAlign: "center", fontSize: "9px", color: "#555" }}>
            <div>Afiyet olsun! 🙏</div>
            <div style={{ marginTop: "1mm" }}>Bizi tercih ettiğiniz için teşekkürler</div>
            <div style={{ marginTop: "3mm", fontSize: "8px" }}>
              {dateStr} {timeStr}
            </div>
          </div>
        </div>
      </>
    );
  },
);

ThermalReceipt.displayName = "ThermalReceipt";
export default ThermalReceipt;
