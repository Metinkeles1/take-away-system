"use server";

// Dashboard "derin analiz" verisi — operasyon, teslimat, iptal, talep, müşteri.
// Seçili dönemden tek sipariş taraması + müşteri sayımlarıyla türetilir.

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import CustomerModel from "@/models/Customer";
import { type OrderSource } from "@/types";
import {
  periodWindows,
  DAY_MS,
  ISTANBUL_OFFSET_MS,
  type DashboardPeriod,
} from "@/lib/dashboardPeriods";
import { SLA_WARN_MIN } from "@/lib/operations";

export interface CourierStat {
  name: string;
  deliveries: number; // taşıdığı paket adedi (iptal hariç)
  avgMin: number | null; // teslim edilenlerin ort. süresi
  amount: number; // taşıdığı tutar
  openAmount: number; // bunun tahsil edilmemiş kısmı
}

export interface DeliveryStat {
  delivered: number; // süresi ölçülen teslimat
  onTime: number; // SLA içinde (<= eşik)
  onTimeRate: number; // %
  avgMin: number | null;
  slowestMin: number | null;
  slaMin: number; // kullanılan eşik
}

export interface CancelStat {
  cancelled: number;
  total: number; // iptal dahil
  rate: number; // %
  prevRate: number | null; // önceki dönem %
}

export interface CohortStat {
  totalCustomers: number;
  activeInPeriod: number; // bu dönem sipariş veren benzersiz müşteri
  newInPeriod: number; // ilk siparişi bu dönem
  returningInPeriod: number; // eski müşteri, bu dönem tekrar geldi
  repeatRate: number; // 2+ siparişli oranı (%)
  atRisk: number; // 30–90 gündür sipariş yok
  lost: number; // 90+ gündür sipariş yok
}

export interface TopCustomer {
  name: string;
  phone: string;
  orderCount: number;
  revenue: number;
}

export interface DashboardInsights {
  couriers: CourierStat[];
  delivery: DeliveryStat;
  cancel: CancelStat;
  heatmap: number[][]; // [7 gün][24 saat], Pazartesi=0
  heatmapMax: number;
  topCustomers: TopCustomer[];
  cohorts: CohortStat;
}

const THIRTY_D = 30 * DAY_MS;
const NINETY_D = 90 * DAY_MS;

function sourceFilter(source: OrderSource | "all"): Record<string, unknown> {
  if (source === "all") return {};
  if (source === "manual") {
    return { $or: [{ source: "manual" }, { source: { $exists: false } }] };
  }
  return { source };
}

export async function getDashboardInsights(
  period: DashboardPeriod = "day",
  source: OrderSource | "all" = "all",
  dayOffset = 0,
): Promise<DashboardInsights> {
  await connectDB();

  const w = periodWindows(period, dayOffset);
  const now = Date.now();
  const filter = sourceFilter(source);

  const [curOrders, prevOrders, totalCustomers, newInPeriod, repeatCount, atRisk, lost] =
    await Promise.all([
      OrderModel.find({
        ...filter,
        createdAt: { $gte: new Date(w.start), $lt: new Date(w.end) },
      })
        .select({
          status: 1,
          total: 1,
          paidAmount: 1,
          paymentStatus: 1,
          createdAt: 1,
          deliveryDurationMin: 1,
          courier: 1,
          "customer.name": 1,
          "customer.phone": 1,
        })
        .lean(),
      OrderModel.find({
        ...filter,
        createdAt: { $gte: new Date(w.prevStart), $lt: new Date(w.prevEnd) },
      })
        .select({ status: 1 })
        .lean(),
      CustomerModel.countDocuments(),
      CustomerModel.countDocuments({
        createdAt: { $gte: new Date(w.start), $lt: new Date(w.end) },
      }),
      CustomerModel.countDocuments({ orderCount: { $gte: 2 } }),
      CustomerModel.countDocuments({
        updatedAt: { $lt: new Date(now - THIRTY_D), $gte: new Date(now - NINETY_D) },
      }),
      CustomerModel.countDocuments({ updatedAt: { $lt: new Date(now - NINETY_D) } }),
    ]);

  // ─── Tek geçiş: kurye, SLA, iptal, ısı haritası, top müşteri ──
  const courierMap = new Map<
    string,
    { deliveries: number; minSum: number; deliveredCount: number; amount: number; openAmount: number }
  >();
  const custMap = new Map<string, { name: string; orderCount: number; revenue: number }>();
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const activePhones = new Set<string>();

  let cancelled = 0;
  let delivered = 0;
  let onTime = 0;
  let minSum = 0;
  let slowest = 0;
  let heatmapMax = 0;

  for (const raw of curOrders) {
    const o = raw as unknown as {
      status: string;
      total: number;
      paidAmount?: number;
      paymentStatus?: string;
      createdAt: Date | string;
      deliveryDurationMin?: number;
      courier?: string;
      customer?: { name?: string; phone?: string };
    };

    if (o.status === "cancelled") {
      cancelled++;
      continue;
    }

    const open = o.paymentStatus === "open" ? Math.max(0, o.total - (o.paidAmount ?? 0)) : 0;

    // Kurye
    if (o.courier) {
      const c = courierMap.get(o.courier) ?? {
        deliveries: 0,
        minSum: 0,
        deliveredCount: 0,
        amount: 0,
        openAmount: 0,
      };
      c.deliveries++;
      c.amount += o.total;
      c.openAmount += open;
      if (o.status === "delivered" && (o.deliveryDurationMin ?? 0) > 0) {
        c.minSum += o.deliveryDurationMin!;
        c.deliveredCount++;
      }
      courierMap.set(o.courier, c);
    }

    // SLA / teslim süresi
    if (o.status === "delivered" && (o.deliveryDurationMin ?? 0) > 0) {
      const m = o.deliveryDurationMin!;
      delivered++;
      minSum += m;
      if (m <= SLA_WARN_MIN) onTime++;
      if (m > slowest) slowest = m;
    }

    // Top müşteri + aktif
    const phone = o.customer?.phone;
    if (phone) {
      activePhones.add(phone);
      const cm = custMap.get(phone) ?? {
        name: o.customer?.name ?? "—",
        orderCount: 0,
        revenue: 0,
      };
      cm.orderCount++;
      cm.revenue += o.total;
      custMap.set(phone, cm);
    }

    // Isı haritası (Istanbul gün × saat; Pazartesi=0)
    const ms =
      o.createdAt instanceof Date ? o.createdAt.getTime() : new Date(o.createdAt).getTime();
    const ist = new Date(ms + ISTANBUL_OFFSET_MS);
    const dow = (ist.getUTCDay() + 6) % 7; // Pzt=0 … Paz=6
    const hour = ist.getUTCHours();
    const v = ++heatmap[dow][hour];
    if (v > heatmapMax) heatmapMax = v;
  }

  const couriers: CourierStat[] = [...courierMap.entries()]
    .map(([name, c]) => ({
      name,
      deliveries: c.deliveries,
      avgMin: c.deliveredCount > 0 ? Math.round(c.minSum / c.deliveredCount) : null,
      amount: c.amount,
      openAmount: c.openAmount,
    }))
    .sort((a, b) => b.deliveries - a.deliveries);

  const topCustomers: TopCustomer[] = [...custMap.entries()]
    .map(([phone, c]) => ({ phone, name: c.name, orderCount: c.orderCount, revenue: c.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const cancel: CancelStat = {
    cancelled,
    total: curOrders.length,
    rate: curOrders.length > 0 ? (cancelled / curOrders.length) * 100 : 0,
    prevRate:
      prevOrders.length > 0
        ? (prevOrders.filter((p) => (p as { status: string }).status === "cancelled").length /
            prevOrders.length) *
          100
        : null,
  };

  const delivery: DeliveryStat = {
    delivered,
    onTime,
    onTimeRate: delivered > 0 ? (onTime / delivered) * 100 : 0,
    avgMin: delivered > 0 ? Math.round(minSum / delivered) : null,
    slowestMin: delivered > 0 ? slowest : null,
    slaMin: SLA_WARN_MIN,
  };

  const activeInPeriod = activePhones.size;
  const cohorts: CohortStat = {
    totalCustomers,
    activeInPeriod,
    newInPeriod,
    returningInPeriod: Math.max(0, activeInPeriod - newInPeriod),
    repeatRate: totalCustomers > 0 ? (repeatCount / totalCustomers) * 100 : 0,
    atRisk,
    lost,
  };

  return { couriers, delivery, cancel, heatmap, heatmapMax, topCustomers, cohorts };
}

// ─── Açık hesaplar (veresiye) özeti — döneme bağlı değil, anlık alacak ───────
export interface OpenAccountsSummary {
  totalOpen: number; // toplam tahsil edilmemiş (₺)
  count: number; // açık sipariş adedi
  customerCount: number; // kaç farklı müşteri
  topDebtors: { name: string; phone: string; amount: number; orders: number }[];
}

export async function getOpenAccountsSummary(): Promise<OpenAccountsSummary> {
  await connectDB();

  const orders = await OrderModel.find({
    paymentStatus: "open",
    status: { $ne: "cancelled" },
  })
    .select({ total: 1, paidAmount: 1, "customer.name": 1, "customer.phone": 1 })
    .lean();

  const byCustomer = new Map<string, { name: string; amount: number; orders: number }>();
  let totalOpen = 0;

  for (const raw of orders) {
    const o = raw as unknown as {
      total: number;
      paidAmount?: number;
      customer?: { name?: string; phone?: string };
    };
    const open = Math.max(0, o.total - (o.paidAmount ?? 0));
    if (open <= 0) continue;
    totalOpen += open;
    const phone = o.customer?.phone ?? "—";
    const c = byCustomer.get(phone) ?? {
      name: o.customer?.name ?? "—",
      amount: 0,
      orders: 0,
    };
    c.amount += open;
    c.orders++;
    byCustomer.set(phone, c);
  }

  const topDebtors = [...byCustomer.entries()]
    .map(([phone, c]) => ({ phone, name: c.name, amount: c.amount, orders: c.orders }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  return {
    totalOpen,
    count: orders.length,
    customerCount: byCustomer.size,
    topDebtors,
  };
}
