"use client";

import React from "react";
import { type Voucher, type Corporate, type PeriodStats } from "@/types";
import { formatCurrency, formatPhone } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import {
  FS_NORMAL,
  FS_SMALL,
  Row,
  Divider,
  SectionTitle,
  ReceiptShell,
  ReceiptHeader,
  GrandTotal,
  aggregateVoucherProducts,
  shortPortion,
  usePrintedAt,
  type ReceiptOptions,
  DEFAULT_RECEIPT_OPTIONS,
  filterVouchersByScope,
  computeVoucherStats,
} from "./corporateReceiptKit";

export default function ProductSummaryReceipt({
  corporate,
  vouchers,
  stats,
  period,
  options = DEFAULT_RECEIPT_OPTIONS,
}: {
  corporate: Corporate;
  vouchers: Voucher[];
  stats: PeriodStats;
  period: string;
  options?: ReceiptOptions;
}) {
  const printedAt = usePrintedAt();
  // Ödeme durumuna göre süz ("open" → açık fişler). "marked" ürün özetinde
  // fiş bazlı ödeme nedeniyle "all" gibi davranır (tüm fişler dahil).
  const visibleVouchers = filterVouchersByScope(vouchers, options.scope);
  const { products, totalQty, personCount } =
    aggregateVoucherProducts(visibleVouchers);
  const displayStats =
    options.scope === "open" ? computeVoucherStats(visibleVouchers) : stats;

  return (
    <ReceiptShell>
      <ReceiptHeader subtitle="Ürün Özeti" />

      <Divider />

      <div
        style={{
          textAlign: "center",
          fontSize: FS_NORMAL,
          fontWeight: 800,
          marginBottom: "4px",
        }}
      >
        {formatPeriodLabel(period)}
      </div>

      <Divider dashed />

      {/* Kurum bilgisi */}
      <SectionTitle>İşletme</SectionTitle>
      <div style={{ fontSize: FS_NORMAL, lineHeight: 1.45, fontWeight: 700 }}>
        <div style={{ fontWeight: 800, wordBreak: "break-word" }}>{corporate.name}</div>
        {corporate.phone && <div>{formatPhone(corporate.phone)}</div>}
      </div>

      <Divider dashed />

      {/* Ürün listesi — isim üstte, "adet" + tutar altta hizalı */}
      {products.length === 0 && (
        <div
          style={{
            fontSize: FS_SMALL,
            textAlign: "center",
            padding: "8px 0",
            fontWeight: 700,
          }}
        >
          {options.scope === "open"
            ? "Açık (ödenmemiş) ürün bulunmuyor."
            : "Bu dönemde ürün bulunmuyor."}
        </div>
      )}

      {products.map((p, pi) => {
        const isLast = pi === products.length - 1;
        const portion = shortPortion(p.portionLabel);
        return (
          <div
            key={p.key}
            style={{
              marginBottom: isLast ? "0" : "5px",
              paddingBottom: isLast ? "0" : "5px",
              borderBottom: isLast ? "none" : "1px dashed #bbb",
            }}
          >
            {/* Ürün adı */}
            <div
              style={{
                fontSize: FS_NORMAL,
                fontWeight: 700,
                overflowWrap: "break-word",
                lineHeight: 1.25,
              }}
            >
              {p.name}
              {portion ? ` (${portion})` : ""}
            </div>
            {/* Adet + tutar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "6px",
                alignItems: "baseline",
                marginTop: "1px",
              }}
            >
              <span
                style={{
                  fontSize: FS_NORMAL,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {p.quantity} ad.
              </span>
              {options.itemPrices && (
                <span
                  style={{
                    fontSize: FS_NORMAL,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {formatCurrency(p.total)}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <Divider />

      {/* Özet */}
      <Row left="Çeşit Sayısı" right={String(products.length)} />
      <Row left="Toplam Adet" right={String(totalQty)} bold />
      {personCount > 0 && (
        <Row left="Kişi Bazlı Toplam" right={`${personCount} kişi`} />
      )}
      {options.paid && (
        <Row left="Tahsil Edilen" right={formatCurrency(displayStats.paid)} />
      )}
      {options.unpaid && (
        <Row left="Açık Bakiye" right={formatCurrency(displayStats.unpaid)} />
      )}

      {options.total && <GrandTotal amount={formatCurrency(displayStats.total)} />}

      <Divider dashed />

      <div
        style={{
          textAlign: "center",
          fontSize: FS_SMALL,
          marginTop: "2px",
          fontWeight: 700,
        }}
      >
        Yazdırılma: {printedAt}
      </div>
    </ReceiptShell>
  );
}
