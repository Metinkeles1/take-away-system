// Sipariş durumu → label + StatusTone normalizasyonu. Manuel ve Trendyol farklı
// status anahtarları kullanıyor; UI tek dil konuşsun diye burada haritalanır.

import type { StatusTone } from "@/components/dashboard/primitives/StatusDot";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

const MANUAL: Record<string, StatusMeta> = {
  pending: { label: "Bekliyor", tone: "info" },
  preparing: { label: "Hazırlanıyor", tone: "warn" },
  "on-the-way": { label: "Yolda", tone: "active" },
  delivered: { label: "Teslim Edildi", tone: "success" },
  completed: { label: "Tamamlandı", tone: "success" },
  cancelled: { label: "İptal", tone: "danger" },
};

const TRENDYOL: Record<string, StatusMeta> = {
  Created: { label: "Yeni", tone: "info" },
  Picking: { label: "Kabul Edildi", tone: "info" },
  Invoiced: { label: "Hazırlandı", tone: "warn" },
  Shipped: { label: "Yolda", tone: "active" },
  Delivered: { label: "Teslim Edildi", tone: "success" },
  Cancelled: { label: "İptal", tone: "danger" },
  UnSupplied: { label: "Karşılanamadı", tone: "danger" },
};

export function manualStatus(status: string): StatusMeta {
  return MANUAL[status] ?? { label: status, tone: "neutral" };
}

export function trendyolStatus(status: string): StatusMeta {
  return TRENDYOL[status] ?? { label: status, tone: "neutral" };
}
