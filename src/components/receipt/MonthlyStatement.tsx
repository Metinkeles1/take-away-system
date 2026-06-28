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
  type ReceiptOptions,
  DEFAULT_RECEIPT_OPTIONS,
  filterVouchersByScope,
  computeVoucherStats,
} from "./corporateReceiptKit";

/** Gün/ay kısaltması (+ çoklu dönemde yıl) + Türkçe gün adı. */
function formatVoucherDate(
  date: Date,
  withYear = false,
): { dateShort: string; weekday: string } {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dateShort = withYear
    ? `${dd}.${mm}.${String(d.getFullYear()).slice(2)}`
    : `${dd}.${mm}`;
  const weekday = d.toLocaleDateString("tr-TR", { weekday: "short" });
  return { dateShort, weekday };
}

/** Bir fişin detay satırları: kişi sayısı / ürün dökümü + not. */
function VoucherDetail({ v }: { v: Voucher }) {
  return (
    <>
      {v.billingType === "per_person" ? (
        <div style={{ fontSize: FS_SMALL, fontWeight: 700, marginTop: "2px" }}>
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
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>
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
    </>
  );
}

/** Sol baştaki durum işareti: dolu kutu+✓ = ödendi, içi boş = açık. */
function StatusMark({ paid }: { paid: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "18px",
        height: "18px",
        border: "2px solid #000",
        borderRadius: "4px",
        backgroundColor: paid ? "#000" : "#fff",
        color: "#fff",
        fontSize: "13px",
        fontWeight: 800,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {paid ? "✓" : ""}
    </span>
  );
}

/** Açık / kısmi durumunu vurgulayan küçük etiket. */
function StatusTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: FS_SMALL,
        fontWeight: 800,
        border: "1px solid #000",
        borderRadius: "3px",
        padding: "0 4px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Tek gün satırı: durum işareti + tarih + tutar + (opsiyonel) ürün dökümü. */
function DayRow({
  v,
  showDetail,
  withYear,
  last,
}: {
  v: Voucher;
  showDetail: boolean;
  withYear: boolean;
  last: boolean;
}) {
  const { dateShort, weekday } = formatVoucherDate(v.date, withYear);
  const partial = !v.paid && v.paidAmount > 0;
  const remaining = v.total - v.paidAmount;
  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
        marginBottom: last ? "0" : "7px",
        paddingBottom: last ? "0" : "7px",
        borderBottom: last ? "none" : "2px dashed #bbb",
      }}
    >
      <div style={{ paddingTop: "1px" }}>
        <StatusMark paid={v.paid} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "6px",
            alignItems: "baseline",
            fontSize: FS_NORMAL,
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

        {showDetail && <VoucherDetail v={v} />}

        {/* Durum: ödenmemişse açık/kısmi vurgusu */}
        {!v.paid && (
          <div style={{ marginTop: "3px" }}>
            {partial ? (
              <StatusTag>
                KISMİ · kalan {formatCurrency(remaining)}
              </StatusTag>
            ) : (
              <StatusTag>AÇIK</StatusTag>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MonthlyStatement({
  corporate,
  vouchers,
  stats,
  period,
  options = DEFAULT_RECEIPT_OPTIONS,
  multiPeriod = false,
}: {
  corporate: Corporate;
  vouchers: Voucher[];
  stats: PeriodStats;
  period: string;
  options?: ReceiptOptions;
  // Açık hesap ekstresi: fişler birden çok aya yayılır → tarihe yıl eklenir.
  multiPeriod?: boolean;
}) {
  const printedAt = useMemo(() => {
    const d = new Date();
    return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }, []);

  // Ödeme durumu filtresi (tümü / sadece ödenen / sadece açık), sonra tarih sırası.
  // Tek liste; her satırda ödendi/açık işareti durur.
  const sortedVouchers = useMemo(
    () =>
      [...filterVouchersByScope(vouchers, options.scope)].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    [vouchers, options.scope],
  );

  // Filtre uygulandıysa özet gösterilen kümeden hesaplanır ki rakamlar listeyle
  // tutarlı kalsın; "tümü"de dönemin tam istatistiği (stats prop) kullanılır.
  const displayStats = useMemo(
    () =>
      options.scope === "all" ? stats : computeVoucherStats(sortedVouchers),
    [options.scope, stats, sortedVouchers],
  );

  const allPaid = displayStats.unpaid <= 0.005;
  const showDetail = options.itemPrices;

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

      {/* Durum açıklaması: ✓ = ödendi, içi boş = açık */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          fontSize: FS_SMALL,
          fontWeight: 700,
          marginBottom: "6px",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <StatusMark paid={true} /> Ödendi
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <StatusMark paid={false} /> Açık
        </span>
      </div>

      {/* Gün listesi */}
      {sortedVouchers.length === 0 ? (
        <div
          style={{
            fontSize: FS_SMALL,
            textAlign: "center",
            padding: "8px 0",
            fontWeight: 700,
          }}
        >
          {options.scope === "open"
            ? "Açık (ödenmemiş) fiş bulunmuyor."
            : options.scope === "paid"
              ? "Ödenmiş fiş bulunmuyor."
              : "Bu dönemde fiş bulunmuyor."}
        </div>
      ) : (
        sortedVouchers.map((v, i) => (
          <DayRow
            key={v.id}
            v={v}
            showDetail={showDetail}
            withYear={multiPeriod}
            last={i === sortedVouchers.length - 1}
          />
        ))
      )}

      <Divider />

      {/* Özet: her zaman toplam / ödenen / kalan borç */}
      <Row left="Fiş Sayısı" right={String(displayStats.count)} />
      <Row left="Toplam" right={formatCurrency(displayStats.total)} />
      <Row left="Ödenen" right={formatCurrency(displayStats.paid)} />

      {allPaid ? (
        <GrandTotal label="DURUM" amount="TAMAMI ÖDENDİ" />
      ) : (
        <GrandTotal label="KALAN BORÇ" amount={formatCurrency(displayStats.unpaid)} />
      )}

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
