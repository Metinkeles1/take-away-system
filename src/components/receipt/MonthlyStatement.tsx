"use client";

import React, { useMemo } from "react";
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
  shortPortion,
} from "./corporateReceiptKit";

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
  const printedAt = useMemo(() => {
    const d = new Date();
    return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }, []);

  // Eski → yeni sırala (ekstre tarih sırasına göre okunsun)
  const sortedVouchers = useMemo(
    () =>
      [...vouchers].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    [vouchers],
  );

  return (
    <ReceiptShell>
      <ReceiptHeader subtitle="Aylık Hesap Ekstresi" />

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

      {/* Fişler */}
      <SectionTitle>Fişler</SectionTitle>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: FS_SMALL,
          fontWeight: 800,
          borderBottom: "2px solid #000",
          paddingBottom: "3px",
          marginBottom: "5px",
        }}
      >
        <span>TARİH</span>
        <span>TUTAR</span>
      </div>

      {sortedVouchers.length === 0 && (
        <div
          style={{
            fontSize: FS_SMALL,
            textAlign: "center",
            padding: "8px 0",
            fontWeight: 700,
          }}
        >
          Bu ayda fiş bulunmuyor.
        </div>
      )}

      {sortedVouchers.map((v, vi) => {
        const d = new Date(v.date);
        const dateShort = `${String(d.getDate()).padStart(2, "0")}.${String(
          d.getMonth() + 1,
        ).padStart(2, "0")}`;
        const weekday = d.toLocaleDateString("tr-TR", { weekday: "short" });
        const isLast = vi === sortedVouchers.length - 1;
        return (
          <div
            key={v.id}
            style={{
              marginBottom: isLast ? "0" : "7px",
              paddingBottom: isLast ? "0" : "7px",
              borderBottom: isLast ? "none" : "2px dashed #bbb",
            }}
          >
            {/* Ana satır: tarih + tutar öne çıkar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "6px",
                fontSize: FS_NORMAL,
                alignItems: "baseline",
              }}
            >
              <span style={{ whiteSpace: "nowrap", fontWeight: 800 }}>
                {dateShort}{" "}
                <span style={{ fontWeight: 600, fontSize: FS_SMALL }}>{weekday}</span>
              </span>
              <span
                style={{
                  textAlign: "right",
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {formatCurrency(v.total)}
              </span>
            </div>

            {/* Detay satırları */}
            {v.billingType === "per_person" ? (
              <div
                style={{
                  fontSize: FS_SMALL,
                  fontWeight: 700,
                  marginTop: "2px",
                }}
              >
                {v.personCount ?? 0} kişi
              </div>
            ) : (
              <div style={{ marginTop: "2px" }}>
                {(v.items ?? []).map((it, idx) => (
                  <div
                    key={`${it.productId}-${idx}`}
                    style={{
                      fontSize: FS_SMALL,
                      fontWeight: 700,
                      lineHeight: 1.4,
                      overflowWrap: "break-word",
                    }}
                  >
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 800,
                      }}
                    >
                      {it.quantity}×
                    </span>{" "}
                    {it.name}
                    {it.portionLabel ? ` (${shortPortion(it.portionLabel)})` : ""}
                  </div>
                ))}
              </div>
            )}

            {v.note && (
              <div
                style={{
                  fontSize: FS_SMALL,
                  fontWeight: 600,
                  fontStyle: "italic",
                  marginTop: "2px",
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

      <GrandTotal amount={formatCurrency(stats.total)} />

      <Divider dashed />

      {/* İmza alanı */}
      <div style={{ fontSize: FS_SMALL, fontWeight: 700, marginTop: "8px" }}>
        <div style={{ marginBottom: "16px" }}>Tahsil Eden / Alan</div>
        <div
          style={{
            borderTop: "2px solid #000",
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
          fontSize: FS_SMALL,
          fontWeight: 700,
          marginTop: "2px",
        }}
      >
        Yazdırılma: {printedAt}
      </div>
    </ReceiptShell>
  );
}
