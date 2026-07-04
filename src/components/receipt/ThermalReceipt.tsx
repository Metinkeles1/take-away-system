"use client";

import React, { useId, useMemo, useSyncExternalStore } from "react";
import { type CustomerOpenAccounts, type OrderDraft } from "@/types";
import { formatCurrency, formatPhone } from "@/lib/utils";

interface ThermalReceiptProps {
  draft: OrderDraft;
  total: number;
  subtotal: number;
  orderNumber?: number;
  // Mevcut bir siparişin oluşturulma tarihi. Verilirse fişte bu tarih/saat
  // basılır (sipariş ne zaman verildiyse o). Verilmezse — yeni sipariş
  // oluşturma akışı — yazdırma anı (new Date()) kullanılır.
  createdAt?: Date | string;
  // Müşterinin ÖNCEKİ ödenmemiş siparişleri. Doluysa fişe "Eski Açık Hesap"
  // bölümü (tam dökümlü) + GENEL TOPLAM eklenir; kurye kapıda toplam alacağı
  // tek kâğıttan görür. Boş/undefined ise fiş bugünküyle birebir aynı kalır.
  openAccounts?: CustomerOpenAccounts | null;
}

// Eski açık hesap satırlarındaki tarih — sadece geçmiş createdAt formatlanır
// (new Date() yok), bu yüzden hydration güvenli. "12 Haz" gibi kısa biçim.
const formatDebtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });

const paymentLabels: Record<string, string> = {
  cash: "NAKİT",
  card: "KREDİ/BANKA KARTI",
  online: "ONLINE ÖDEME",
  meal_card: "YEMEK KARTI",
  iban: "IBAN / HAVALE",
};

const mealCardLabels: Record<string, string> = {
  multinet: "Multinet",
  setcard: "Setcard",
  pluxee: "Pluxee",
  edenred: "Edenred",
  tokenflex: "Tokenflex",
  metropol: "Metropol",
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
  ({ draft, total, subtotal, orderNumber, createdAt, openAccounts }, ref) => {
    const hasDebt = !!openAccounts && openAccounts.orders.length > 0;
    const grandTotal = total + (openAccounts?.total ?? 0);
    const uniqueId = useId();
    const receiptId = `thermal-receipt-${uniqueId.replace(/:/g, "")}`;

    // Fişteki tarih/saat = siparişin verildiği an (createdAt). Mevcut bir
    // siparişi sonradan yazdırınca yazdırma anı değil, sipariş zamanı basılır.
    //
    // createdAt verilmezse (yeni sipariş oluşturma akışı) yazdırma anı kullanılır.
    // Bu durumda tarih SADECE client'ta hesaplanır — SSR'da new Date() çağırırsak
    // sunucu vs. istemci farklı saatte render edip hydration mismatch oluşur
    // (özellikle gece yarısı sınırını geçince gün de farklı çıkar).
    // useSyncExternalStore: SSR snapshot null, client snapshot ilk çağrıda
    // cache'lenen Date. Re-render'larda aynı instance döner; setState-in-effect
    // gerekmiyor.
    const getDateSnapshot = useMemo(() => {
      let cached: Date | null = null;
      return () => (cached ??= new Date());
    }, []);
    const liveDate = useSyncExternalStore(
      () => () => {},
      getDateSnapshot,
      () => null,
    );
    // createdAt sabit bir geçmiş tarih olduğundan SSR'da da güvenle render edilir.
    const receiptDate = createdAt ? new Date(createdAt) : liveDate;
    const dateStr = receiptDate ? receiptDate.toLocaleDateString("tr-TR") : "";
    const timeStr = receiptDate
      ? receiptDate.toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

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

            {/* KURYE NOTU — siparişin notu kurye için en kritik bilgi olabilir
                (zil çalma, kat, kapıda üstü, vb.). Basit sınır içinde kalın metin. */}
            {draft.notes && (
              <div
                style={{
                  border: "2px solid #000",
                  borderRadius: "4px",
                  marginTop: "8px",
                  padding: "8px 8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: FONT_SIZE_NORMAL,
                    fontWeight: 800,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    wordWrap: "break-word",
                    overflowWrap: "break-word",
                  }}
                >
                  {draft.notes}
                </div>
              </div>
            )}

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

            {draft.items.map((item, idx) => (
              <div key={`item-${idx}`} style={{ marginBottom: "4px" }}>
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
                    {item.portion && (
                      <span style={{ fontWeight: 400, fontSize: "0.85em" }}>
                        {" "}
                        ({item.portion.label})
                      </span>
                    )}
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

            {/* Eski Açık Hesap — müşterinin önceki ödenmemiş siparişleri, her biri
                kendi ürün dökümüyle. Kesik çizgili kutu, o anki siparişle karışmasın.
                Altında GENEL TOPLAM = bu sipariş + eski borç (kapıda toplanacak). */}
            {hasDebt && (
              <>
                <div
                  style={{
                    border: "1px dashed #000",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    marginTop: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      fontSize: FONT_SIZE_XSMALL,
                      fontWeight: 700,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    <span>Eski Açık Hesap ({openAccounts!.count})</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatCurrency(openAccounts!.total)}
                    </span>
                  </div>

                  {openAccounts!.orders.map((d, oi) => (
                    <div
                      key={d.id}
                      style={{ marginTop: oi === 0 ? 0 : "6px" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          fontSize: FONT_SIZE_XSMALL,
                          fontWeight: 700,
                        }}
                      >
                        <span>
                          #{d.orderNumber} · {formatDebtDate(d.createdAt)}
                        </span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatCurrency(d.total)}
                        </span>
                      </div>

                      {d.items.length === 0 ? (
                        <div
                          style={{
                            fontSize: FONT_SIZE_XSMALL,
                            paddingLeft: "8px",
                            color: "#333",
                          }}
                        >
                          Ürün bilgisi yok
                        </div>
                      ) : (
                        d.items.map((it, ii) => (
                          <div
                            key={`${d.id}-${ii}`}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "4px",
                              fontSize: FONT_SIZE_XSMALL,
                              paddingLeft: "8px",
                              lineHeight: 1.3,
                            }}
                          >
                            <span
                              style={{
                                minWidth: 0,
                                overflowWrap: "break-word",
                              }}
                            >
                              {it.quantity}× {it.name}
                            </span>
                            <span
                              style={{
                                whiteSpace: "nowrap",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {formatCurrency(it.totalPrice)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    border: "2px solid #000",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    marginTop: "6px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: FONT_SIZE_NORMAL }}>
                    GENEL TOPLAM
                  </span>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: FONT_SIZE_LARGE,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </>
            )}

            <Divider dashed />

            <SectionTitle>Ödeme Yöntemi</SectionTitle>
            <div
              style={{
                fontSize: FONT_SIZE_NORMAL,
                fontWeight: 700,
                marginBottom: "2px",
              }}
            >
              {paymentLabels[draft.payment.method ?? ""] ?? "—"}
            </div>

            {/* Yemek Kartı Markası */}
            {draft.payment.method === "meal_card" && draft.payment.mealCardBrand && (
              <div
                style={{
                  fontSize: FONT_SIZE_NORMAL,
                  marginBottom: "4px",
                }}
              >
                {mealCardLabels[draft.payment.mealCardBrand] ??
                  draft.payment.mealCardBrand}
              </div>
            )}

            {/* IBAN Bilgileri */}
            {draft.payment.method === "iban" && (
              <div
                style={{
                  fontSize: FONT_SIZE_NORMAL,
                  marginBottom: "4px",
                  lineHeight: 1.5,
                }}
              >
                {draft.payment.ibanName && (
                  <div style={{ fontWeight: 400 }}>
                    Ad Soyad:{" "}
                    <span style={{ fontWeight: 700 }}>{draft.payment.ibanName}</span>
                  </div>
                )}
                {draft.payment.ibanNumber && (
                  <div
                    style={{
                      fontWeight: 700,
                      letterSpacing: "0.2px",
                      wordBreak: "break-all",
                    }}
                  >
                    {draft.payment.ibanNumber}
                  </div>
                )}
              </div>
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
