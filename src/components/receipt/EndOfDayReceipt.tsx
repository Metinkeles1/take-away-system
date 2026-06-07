"use client";

import React, { memo, useId, useMemo, useSyncExternalStore } from "react";
import { type EndOfDayReport } from "@/actions/endOfDay";
import { formatCurrency } from "@/lib/utils";

interface EndOfDayReceiptProps {
  report: EndOfDayReport;
  cashCounted?: number | null; // elle girilen nakit kasa toplamı
  cardCounted?: number | null; // elle girilen kredi kartı (POS) toplamı
  ibanCounted?: number | null; // elle girilen IBAN / havale toplamı
  ticketCounted?: number | null; // elle girilen yemek kartı (ticket) toplamı
}

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

// Adet + tutar gösteren üç sütunlu kırılım satırı.
const BreakdownRow = ({
  label,
  count,
  amount,
}: {
  label: string;
  count: number;
  amount: number;
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 9mm 20mm",
      columnGap: "2mm",
      alignItems: "baseline",
      fontSize: FONT_SIZE_NORMAL,
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
      {label}
    </span>
    <span style={{ textAlign: "center", whiteSpace: "nowrap" }}>{count}</span>
    <span
      style={{
        textAlign: "right",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 700,
      }}
    >
      {formatCurrency(amount)}
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

function formatDateTR(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const EndOfDayReceipt = React.forwardRef<HTMLDivElement, EndOfDayReceiptProps>(
  ({ report, cashCounted, cardCounted, ibanCounted, ticketCounted }, ref) => {
    const uniqueId = useId();
    const receiptId = `eod-receipt-${uniqueId.replace(/:/g, "")}`;

    // Baskı zamanı sadece client'ta (hydration mismatch'i önle).
    const getDateSnapshot = useMemo(() => {
      let cached: Date | null = null;
      return () => (cached ??= new Date());
    }, []);
    const printDate = useSyncExternalStore(
      () => () => {},
      getDateSnapshot,
      () => null,
    );
    const printedStr = printDate
      ? `${printDate.toLocaleDateString("tr-TR")} ${printDate.toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "";

    // Elle girilen kasa kalemleri (Trendyol hariç) — yalnızca girilenler basılır.
    const kasaRows = [
      { label: "Nakit", value: cashCounted },
      { label: "Kredi Kartı (POS)", value: cardCounted },
      { label: "IBAN / Havale", value: ibanCounted },
      { label: "Yemek Kartı (Ticket)", value: ticketCounted },
    ].filter((r) => r.value != null) as { label: string; value: number }[];
    const kasaTotal = kasaRows.reduce((s, r) => s + r.value, 0);

    // Trendyol hakedişi — kredi kartı (net) ile ticket ayrı satır.
    const ty = report.trendyol;
    const tyAvailable = !!ty?.available && ty.orderCount > 0;
    const tyEarnings = tyAvailable ? ty!.earnings : null;
    // Trendyol'dan bankaya gelen net satış (otomatik).
    const tyBankNet = tyAvailable
      ? tyEarnings?.totalBankNet ?? ty!.netRevenue
      : 0;
    // Genel toplam = elle girilen kasa + Trendyol net satış.
    const grandTotal = kasaTotal + tyBankNet;
    const showGrandTotal = kasaRows.length > 0 || tyAvailable;

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
            {/* Başlık */}
            <div style={{ textAlign: "center", marginBottom: "6px" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "1px" }}>
                KONAK KEBAP
              </div>
              <div style={{ fontSize: FONT_SIZE_NORMAL, marginTop: "2px", fontWeight: 700 }}>
                GÜN SONU RAPORU
              </div>
              <div style={{ fontSize: FONT_SIZE_XSMALL, marginTop: "2px" }}>
                {formatDateTR(report.date)}
              </div>
            </div>

            <Divider />

            {/* Özet */}
            <SectionTitle>Özet</SectionTitle>
            <Row left="Toplam Paket" right={`${report.packageCount}`} bold />
            <Row left="Ortalama Sepet" right={formatCurrency(report.avgBasket)} />
            {report.cancelledCount > 0 && (
              <Row left="İptal Edilen" right={`${report.cancelledCount}`} />
            )}

            <div style={{ borderTop: "2px solid #000", marginTop: "4px", paddingTop: "4px" }}>
              <Row left="TOPLAM CİRO" right={formatCurrency(report.totalRevenue)} bold large />
            </div>

            <Divider dashed />

            {/* Kasa (elle girilen, Trendyol hariç) */}
            {kasaRows.length > 0 && (
              <>
                <SectionTitle>Kasa (Trendyol Hariç)</SectionTitle>
                {kasaRows.map((r) => (
                  <Row key={r.label} left={r.label} right={formatCurrency(r.value)} />
                ))}
                <div style={{ borderTop: "1px solid #000", marginTop: "3px", paddingTop: "3px" }}>
                  <Row left="Kasa Toplam" right={formatCurrency(kasaTotal)} bold />
                </div>
                <Divider dashed />
              </>
            )}

            {/* Trendyol hakediş — bankaya gelecek (net hakediş + ticket) */}
            {ty?.available && ty.orderCount > 0 && (
              <>
                <SectionTitle>Trendyol Hakediş</SectionTitle>
                {tyEarnings ? (
                  <>
                    {tyEarnings.creditCard.count > 0 && (
                      <Row
                        left="Net Hakediş (Kredi Kartı)"
                        right={formatCurrency(tyEarnings.creditCard.bankNet)}
                      />
                    )}
                    {tyEarnings.ticket.count > 0 && (
                      <Row
                        left="Ticket Hakediş"
                        right={formatCurrency(tyEarnings.ticket.bankNet)}
                      />
                    )}
                    <div
                      style={{ borderTop: "1px solid #000", marginTop: "3px", paddingTop: "3px" }}
                    >
                      <Row
                        left="Bankaya Yatacak"
                        right={formatCurrency(tyEarnings.totalBankNet)}
                        bold
                      />
                    </div>
                  </>
                ) : (
                  <Row left="Net Hakediş" right={formatCurrency(ty.netRevenue)} bold />
                )}
                <Divider dashed />
              </>
            )}

            {/* Genel toplam — kasa + Trendyol net satış (günün net geliri) */}
            {showGrandTotal && (
              <>
                <div
                  style={{ borderTop: "2px solid #000", marginTop: "2px", paddingTop: "4px" }}
                >
                  <Row left="GENEL TOPLAM" right={formatCurrency(grandTotal)} bold large />
                </div>
                <Divider dashed />
              </>
            )}

            {/* Açık hesap (tahsil edilmemiş) */}
            {report.openAmount > 0 && (
              <Row
                left={`Açık Hesap (${report.openCount})`}
                right={formatCurrency(report.openAmount)}
                bold
              />
            )}

            {/* Kurumsal — o gün giden hesaplar */}
            {report.corporateBreakdown.length > 0 && (
              <>
                <Divider dashed />
                <SectionTitle>Kurumsal Hesaplar (Bugün)</SectionTitle>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 9mm 20mm",
                    columnGap: "2mm",
                    fontSize: FONT_SIZE_XSMALL,
                    fontWeight: 700,
                    borderBottom: "1px solid #000",
                    paddingBottom: "3px",
                    marginBottom: "4px",
                  }}
                >
                  <span>FİRMA</span>
                  <span style={{ textAlign: "center" }}>FİŞ</span>
                  <span style={{ textAlign: "right" }}>TUTAR</span>
                </div>
                {report.corporateBreakdown.map((c) => (
                  <div key={c.id} style={{ marginBottom: "3px" }}>
                    <BreakdownRow label={c.name} count={c.count} amount={c.amount} />
                    {c.openAmount > 0 && (
                      <div
                        style={{
                          fontSize: FONT_SIZE_XSMALL,
                          paddingLeft: "2px",
                          marginTop: "-1px",
                        }}
                      >
                        (açık: {formatCurrency(c.openAmount)})
                      </div>
                    )}
                  </div>
                ))}
                <div
                  style={{
                    borderTop: "1px solid #000",
                    marginTop: "3px",
                    paddingTop: "3px",
                  }}
                >
                  <Row
                    left="Kurumsal Toplam"
                    right={formatCurrency(report.corporateTotal)}
                    bold
                  />
                  {report.corporateOpen > 0 && (
                    <Row
                      left="  Bunun Açık Kısmı"
                      right={formatCurrency(report.corporateOpen)}
                    />
                  )}
                </div>
              </>
            )}

            <Divider />

            <div
              style={{
                textAlign: "center",
                fontSize: FONT_SIZE_XSMALL,
                marginTop: "2px",
              }}
            >
              <div>Rapor alınma zamanı</div>
              <div style={{ fontWeight: 700 }}>{printedStr}</div>
            </div>
          </div>
        </div>
      </>
    );
  },
);

EndOfDayReceipt.displayName = "EndOfDayReceipt";

// report aynı referansta kaldığı sürece (ör. isLoading toggle'ında) yeniden
// render etme — ağır DOM ağacını boşa yeniden oluşturmayı önler.
export default memo(EndOfDayReceipt);
