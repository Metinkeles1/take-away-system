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

/** "Ödenenleri işaretle" modundaki kutucuk: dolu (✓) ödendi, boş açık. */
function StatusBox({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "17px",
        height: "17px",
        border: "2px solid #000",
        borderRadius: "3px",
        backgroundColor: checked ? "#000" : "#fff",
        color: "#fff",
        fontSize: "12px",
        fontWeight: 800,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {checked ? "✓" : ""}
    </span>
  );
}

/**
 * Grup başlığı: ÖDENENLER / AÇIK + gün sayısı. Sade, altı kalın çizgili;
 * solunda grup tipini gösteren mini kutucuk (dolu = ödenen, boş = açık).
 */
function GroupHeader({
  label,
  count,
  filled,
}: {
  label: string;
  count: number;
  filled: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "2px solid #000",
        paddingBottom: "4px",
        fontSize: FS_SMALL,
        fontWeight: 800,
        letterSpacing: "1px",
        marginBottom: "8px",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <span
          style={{
            width: "13px",
            height: "13px",
            border: "2px solid #000",
            borderRadius: "3px",
            backgroundColor: filled ? "#000" : "#fff",
            flexShrink: 0,
          }}
        />
        {label}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{count} GÜN</span>
    </div>
  );
}

/** Üst durum şeridi: bir bakışta açık gün sayısı + kalan borç. */
function StatusBar({ openCount, totalCount, openAmount }: {
  openCount: number;
  totalCount: number;
  openAmount: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        border: "2px solid #000",
        borderRadius: "4px",
        padding: "5px 8px",
        fontSize: FS_SMALL,
        fontWeight: 700,
        marginBottom: "10px",
      }}
    >
      <span>
        {totalCount} günün <span style={{ fontWeight: 800 }}>{openCount}&apos;ü açık</span>
      </span>
      <span>
        Açık:{" "}
        <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {openAmount}
        </span>
      </span>
    </div>
  );
}

/** Bir gün satırı (kutucuklu). marked modunda kullanılır. */
function MarkedDayRow({
  v,
  showAmount,
  withYear,
}: {
  v: Voucher;
  showAmount: boolean;
  withYear: boolean;
}) {
  const { dateShort, weekday } = formatVoucherDate(v.date, withYear);
  const remaining = v.total - v.paidAmount;
  const partial = !v.paid && v.paidAmount > 0;
  return (
    <div style={{ display: "flex", gap: "7px", alignItems: "flex-start", marginBottom: "7px" }}>
      <div style={{ paddingTop: "1px" }}>
        <StatusBox checked={v.paid} />
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
          {showAmount && (
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
          )}
        </div>

        <VoucherDetail v={v} />

        {partial && (
          <div
            style={{
              fontSize: FS_SMALL,
              fontWeight: 700,
              marginTop: "2px",
              border: "1px dashed #000",
              borderRadius: "3px",
              padding: "1px 4px",
              display: "inline-block",
            }}
          >
            Kısmi: {formatCurrency(v.paidAmount)} ödendi · kalan{" "}
            {formatCurrency(remaining)}
          </div>
        )}
      </div>
    </div>
  );
}

/** marked modunda bir grubun ara toplam satırı. */
function SubtotalRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        borderTop: "2px solid #000",
        paddingTop: "3px",
        marginTop: "1px",
        fontSize: FS_NORMAL,
        fontWeight: 800,
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{amount}</span>
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

  // Ödeme durumuna göre süz, sonra eski → yeni sırala (ekstre tarih sırasına göre).
  const visibleVouchers = useMemo(
    () => filterVouchersByScope(vouchers, options.scope),
    [vouchers, options.scope],
  );
  const sortedVouchers = useMemo(
    () =>
      [...visibleVouchers].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    [visibleVouchers],
  );
  // "open" modunda yalnızca bir alt küme gösterildiğinden özet o kümeden hesaplanır;
  // diğer modlarda dönemin tam istatistiği (stats prop) kullanılır.
  const displayStats =
    options.scope === "open" ? computeVoucherStats(visibleVouchers) : stats;

  const isMarked = options.scope === "marked";

  // marked modunda ödenmiş / açık gruplarına ayır + ara toplamlar.
  const { paidDays, openDays, paidSubtotal, openRemaining } = useMemo(() => {
    const paid = sortedVouchers.filter((v) => v.paid);
    const open = sortedVouchers.filter((v) => !v.paid);
    return {
      paidDays: paid,
      openDays: open,
      paidSubtotal: paid.reduce((s, v) => s + v.total, 0),
      openRemaining: open.reduce((s, v) => s + (v.total - v.paidAmount), 0),
    };
  }, [sortedVouchers]);

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
            : "Bu ayda fiş bulunmuyor."}
        </div>
      ) : isMarked ? (
        /* ── "Ödenenleri işaretle": durum şeridi + iki gruplu ekstre (açık önce) ── */
        <>
          <StatusBar
            openCount={openDays.length}
            totalCount={sortedVouchers.length}
            openAmount={formatCurrency(openRemaining)}
          />

          {openDays.length > 0 && (
            <div style={{ marginBottom: paidDays.length > 0 ? "12px" : "0" }}>
              <GroupHeader label="AÇIK" count={openDays.length} filled={false} />
              {openDays.map((v) => (
                <MarkedDayRow
                  key={v.id}
                  v={v}
                  showAmount={options.itemPrices}
                  withYear={multiPeriod}
                />
              ))}
              {options.total && (
                <SubtotalRow
                  label="Kalan Borç"
                  amount={formatCurrency(openRemaining)}
                />
              )}
            </div>
          )}

          {paidDays.length > 0 && (
            <div>
              <GroupHeader label="ÖDENENLER" count={paidDays.length} filled={true} />
              {paidDays.map((v) => (
                <MarkedDayRow
                  key={v.id}
                  v={v}
                  showAmount={options.itemPrices}
                  withYear={multiPeriod}
                />
              ))}
              {options.total && (
                <SubtotalRow
                  label="Ara Toplam"
                  amount={formatCurrency(paidSubtotal)}
                />
              )}
            </div>
          )}
        </>
      ) : (
        /* ── "Tümü" / "Sadece açık": düz tarih listesi ── */
        <>
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
            {options.itemPrices && <span>TUTAR</span>}
          </div>

          {sortedVouchers.map((v, vi) => {
            const { dateShort, weekday } = formatVoucherDate(v.date, multiPeriod);
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
                    <span style={{ fontWeight: 600, fontSize: FS_SMALL }}>
                      {weekday}
                    </span>
                  </span>
                  {options.itemPrices && (
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
                  )}
                </div>

                <VoucherDetail v={v} />
              </div>
            );
          })}
        </>
      )}

      <Divider />

      {/* Özet */}
      <Row left="Fiş Sayısı" right={String(displayStats.count)} />
      {options.total && (
        <Row left="Toplam" right={formatCurrency(displayStats.total)} />
      )}
      {options.paid && (
        <Row left="Tahsil Edilen" right={formatCurrency(displayStats.paid)} />
      )}
      {options.unpaid && (
        <Row left="Açık Bakiye" right={formatCurrency(displayStats.unpaid)} bold />
      )}

      {options.total &&
        (isMarked ? (
          <GrandTotal label="KALAN BORÇ" amount={formatCurrency(openRemaining)} />
        ) : (
          <GrandTotal amount={formatCurrency(displayStats.total)} />
        ))}

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
