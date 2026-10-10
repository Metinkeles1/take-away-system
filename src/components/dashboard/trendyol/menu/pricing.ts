// Menü sayfasının saf hesap yardımcıları: ürün başına kampanya indirimi,
// müşterinin ödediği ve komisyon sonrası hakediş + CSV dışa aktarma.

import {
  calcCampaignDiscount,
  type CampaignGroup,
  type DiscountSource,
} from "@/lib/trendyolCampaigns";
import type { TrendyolMenuItem } from "@/actions/trendyolMenu";

export interface PriceBreakdown {
  price: number;
  discount: number;
  source: DiscountSource;
  customerPays: number; // fiyat − indirim
  commission: number;
  payout: number; // hakediş: müşterinin ödediği − komisyon
  hint: string | null; // indirim yoksa bir sonraki kademeye ne kaldığı
}

export function breakdown(
  group: CampaignGroup,
  price: number,
  commissionRate: number,
): PriceBreakdown {
  const r = calcCampaignDiscount(group, price, true);
  const customerPays = Math.max(0, price - r.discount);
  const commission = Math.round(customerPays * commissionRate * 100) / 100;
  return {
    price,
    discount: r.discount,
    source: r.source,
    customerPays,
    commission,
    payout: customerPays - commission,
    hint:
      r.discount === 0 && r.nextTier
        ? `+${formatTl(r.amountToNextTier)} ile −${formatTl(r.nextTier.discount)}`
        : null,
  };
}

// Kısa TL gösterimi (kuruş varsa göster): 250 → "250 ₺", 92.5 → "92,50 ₺".
export function formatTl(n: number): string {
  const whole = Math.abs(n % 1) < 0.005;
  return (
    n.toLocaleString("tr-TR", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }) + " ₺"
  );
}

// "120,5" / "120.5" / " 120 " → 120.5; geçersizse NaN.
export function parseAmount(raw: string): number {
  const v = parseFloat(raw.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
}

function csvCell(v: string | number): string {
  return `"${String(v).replaceAll('"', '""')}"`;
}

// Türkçe Excel uyumlu sayı: ondalık virgül.
function csvNumber(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

export function exportMenuCsv(
  items: TrendyolMenuItem[],
  sectionName: (id: number) => string,
  calc: (price: number) => PriceBreakdown,
) {
  const headers = [
    "Ürün",
    "Kategori",
    "Fiyat (₺)",
    "İndirim (₺)",
    "Müşteri öder (₺)",
    "Hakediş (₺)",
    "Durum",
    "Açıklama",
  ];
  const rows = items.map((item) => {
    const b = calc(item.price);
    return [
      item.name,
      item.sectionIds.map(sectionName).join(", "),
      csvNumber(item.price),
      b.discount > 0 ? csvNumber(b.discount) : "",
      csvNumber(b.customerPays),
      csvNumber(b.payout),
      item.isActive ? "Satışta" : "Kapalı",
      item.description ?? "",
    ];
  });
  // ; ayraç (TR Excel) + BOM (UTF-8 algılama).
  const csv =
    "﻿" + [headers, ...rows].map((cols) => cols.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `trendyol-menu-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  // Hemen iptal edilirse bazı tarayıcılarda (Safari/Firefox) indirme yarıda kalır.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
