// Trendyol finansal kayıt (settlement) çekme yardımcıları — dashboard raporu ve
// sipariş arşivi (sipariş bazlı hakediş) ortak kullanır.

import {
  listTrendyolSettlements,
  type TrendyolSettlement,
  type TrendyolSettlementTransactionType,
} from "./client";

// Settlement endpoint'inde tarih aralığı max 15 gün → daha uzun period'lar için
// chunk'lara böl, paralel çağır, content'leri birleştir.
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

export function chunkRange(start: number, end: number): Array<{ s: number; e: number }> {
  const chunks: Array<{ s: number; e: number }> = [];
  let cursor = start;
  while (cursor < end) {
    const next = Math.min(cursor + FIFTEEN_DAYS_MS - 1, end);
    chunks.push({ s: cursor, e: next });
    cursor = next + 1;
  }
  return chunks.length ? chunks : [{ s: start, e: end }];
}

export async function fetchSettlementType(
  type: TrendyolSettlementTransactionType,
  start: number,
  end: number,
): Promise<{ ok: true; items: TrendyolSettlement[] } | { ok: false; error: string }> {
  const chunks = chunkRange(start, end);
  const all: TrendyolSettlement[] = [];

  for (const { s, e } of chunks) {
    let page = 0;
    while (page < 50) {
      const res = await listTrendyolSettlements({
        transactionType: type,
        startDate: s,
        endDate: e,
        page,
        size: 1000,
      });
      if (!res.ok) {
        return { ok: false, error: `${type} (${res.status}): ${res.error}` };
      }
      all.push(...(res.data.content ?? []));
      const totalPages = res.data.totalPages ?? 1;
      if (page + 1 >= totalPages) break;
      page++;
    }
  }
  return { ok: true, items: all };
}

export const FINANCE_TYPES: TrendyolSettlementTransactionType[] = [
  "Sale",
  "Return",
  "Discount",
  "DiscountCancel",
  "Coupon",
  "CouponCancel",
  "ManualRefund",
  "ManualRefundCancel",
];

// Trendyol sellerRevenue ve commissionAmount değerlerini her transactionType için
// MUTLAK (pozitif) gönderiyor; işaret transactionType'tan çıkarılır.
// Doküman tablosundan: + = satıcı lehine, − = satıcı aleyhine.
export const TYPE_SIGN: Record<TrendyolSettlementTransactionType, 1 | -1> = {
  Sale: 1,
  DiscountCancel: 1,
  CouponCancel: 1,
  ManualRefundCancel: 1,
  ProvisionPositive: 1,
  Return: -1,
  Discount: -1,
  Coupon: -1,
  ManualRefund: -1,
  ProvisionNegative: -1,
};
