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
} from "./corporateReceiptKit";

export default function ProductSummaryReceipt({
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
  const printedAt = usePrintedAt();
  const { products, totalQty, personCount } = aggregateVoucherProducts(vouchers);

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
          Bu dönemde ürün bulunmuyor.
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

      <GrandTotal amount={formatCurrency(stats.total)} />

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
