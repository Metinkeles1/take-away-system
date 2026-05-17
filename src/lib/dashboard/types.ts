// ─── Ortak Dashboard ViewModel ─────────────────────────────────────────────
// Her source adapter'ı bu shape'i döndürür. UI sadece bunu okur, kaynağı
// bilmez. Source-specific zenginlikler `extensions` altında yaşar.

import type { MetricFormat } from "@/components/dashboard/primitives/formatters";
import type { StatusTone } from "@/components/dashboard/primitives/StatusDot";

// ─── Metrikler ──────────────────────────────────────────────────────────────
export interface MetricVM {
  key: string;
  label: string;
  value: number;
  format: MetricFormat;
  delta?: number | null;        // önceki periyota göre yüzde
  positiveIsGood?: boolean;     // iade/iptal için false
  spark?: { x: number; y: number }[];
}

// ─── Zaman serisi ───────────────────────────────────────────────────────────
// Bucket label (örn. "Pzt 12 May" veya "14:00") ve 1-2 numerik seri.
// UI bucket granülaritesini bilmez — kaynak hangisini doğru bulursa onu verir.
export interface TrendVM {
  buckets: { label: string; primary: number; secondary?: number }[];
  primaryLabel: string;
  secondaryLabel?: string;
  primaryFormat: MetricFormat;
}

// ─── Top ürünler ─────────────────────────────────────────────────────────────
export interface TopProductVM {
  name: string;
  quantity: number;
  revenue: number;
  share: number; // 0..1
  delta?: number | null;
}

// ─── Son siparişler ─────────────────────────────────────────────────────────
export interface RecentOrderVM {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  net?: number;            // Trendyol için sellerRevenue; manual için undefined
  statusLabel: string;
  statusTone: StatusTone;
  paymentLabel?: string;
  createdAt: number;       // epoch ms
  region?: string;         // varsa (Trendyol)
  itemCount?: number;
}

// ─── Ödeme dağılımı ─────────────────────────────────────────────────────────
export interface PaymentBreakdownVM {
  key: string;
  label: string;
  count?: number;
  revenue: number;
  share: number; // 0..1
}

// ─── Durum dağılımı ─────────────────────────────────────────────────────────
export interface StatusBreakdownVM {
  status: string;
  label: string;
  tone: StatusTone;
  count: number;
}

// ─── Extensions ─────────────────────────────────────────────────────────────
// Source-specific zenginlikler. Tüm alanlar opsiyonel; UI sadece var olanı
// render eder. Yeni kaynak eklenirse buraya yeni opsiyonel alan açılır.

export interface TrendyolFinanceVM {
  grossSales: number;
  totalDiscount: number;
  totalCoupon: number;
  totalRefund: number;
  totalCommission: number;
  netRevenue: number;
  available: boolean;
  error?: string;
}

export interface TopAddressVM {
  address: string;
  orderCount: number;
  revenue: number;
}

export interface MealCardItemVM {
  brand: string;
  count: number;
  revenue: number;
  source: "online" | "on_delivery" | "mixed";
}

export interface HourlyBucketVM {
  hour: number;
  orders: number;
  revenue: number;
}

export interface CategoryBreakdownVM {
  category: string;
  label: string;
  quantity: number;
  revenue: number;
}

export interface DashboardExtensions {
  finance?: TrendyolFinanceVM;
  topAddresses?: TopAddressVM[];
  mealCardBreakdown?: MealCardItemVM[];
  hourly?: HourlyBucketVM[];
  categoryBreakdown?: CategoryBreakdownVM[];
}

// ─── Ana ViewModel ──────────────────────────────────────────────────────────
export interface DashboardViewModel {
  source: string;                 // "manual" | "trendyol" | "getir" | ...
  fetchedAt: number;
  rangeStart: number;
  rangeEnd: number;
  metrics: MetricVM[];
  trend: TrendVM;
  topProducts: TopProductVM[];
  recentOrders: RecentOrderVM[];
  paymentBreakdown: PaymentBreakdownVM[];
  statusBreakdown: StatusBreakdownVM[];
  extensions: DashboardExtensions;
  error?: string;
}
