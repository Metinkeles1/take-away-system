"use server";

// Sıfırdan, tek çağrılık dashboard veri katmanı. Amaç: bir işletme sahibinin
// "şu an / bu dönem ne durumdayım" sorusuna tek bakışta cevap. Dağınık çoklu
// action yerine seçilen döneme göre tek temiz sözleşme döndürür.

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import CustomerModel from "@/models/Customer";
import { type OrderSource } from "@/types";
import { istanbulDayStart } from "@/lib/datetime";
import { estimateOrderNet } from "@/lib/commission";
import { type RegionPin } from "@/actions/trendyolRegions";
import {
  periodWindows,
  DAY_MS,
  ISTANBUL_OFFSET_MS,
  type DashboardPeriod,
} from "@/lib/dashboardPeriods";

export type PaymentKey = "cash" | "card" | "online" | "meal_card" | "iban";

const PAYMENT_LABELS: Record<PaymentKey, string> = {
  cash: "Nakit",
  card: "Kart",
  online: "Online",
  meal_card: "Yemek Kartı",
  iban: "Havale",
};

const CHANNEL_LABELS: Record<OrderSource, string> = {
  manual: "Telefon / Paket",
  trendyol: "Trendyol",
  getir: "Getir",
  yemeksepeti: "Yemeksepeti",
};

const MEAL_BRAND_LABELS: Record<string, string> = {
  multinet: "Multinet",
  setcard: "Setcard",
  pluxee: "Pluxee",
  edenred: "Edenred",
  tokenflex: "Tokenflex",
  metropol: "Metropol",
};

// Kaynak (kanal) Mongo filtresi — eski kayıtlarda source yok → manual sayılır.
function buildSourceFilter(
  source: OrderSource | "all",
): Record<string, unknown> {
  if (source === "all") return {};
  if (source === "manual") {
    return { $or: [{ source: "manual" }, { source: { $exists: false } }] };
  }
  return { source };
}

export interface OverviewMetric {
  revenue: number; // brüt ciro (iptal hariç)
  net: number; // tahmini net (komisyon sonrası)
  orderCount: number; // iptal hariç sipariş
  avgBasket: number; // ort. sepet
  cancelledCount: number;
}

export interface DashboardOverview {
  period: DashboardPeriod;
  dayOffset: number; // kaç dönem geriye (0=güncel, 1=bir önceki …)
  current: OverviewMetric;
  previous: OverviewMetric; // bir önceki eşit dönem (kıyas)
  trend: { label: string; revenue: number; orders: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  channels: { source: OrderSource; label: string; revenue: number; orderCount: number }[];
  // Ödeme yöntemi toplamları (yemek kartı tek satır — marka detayı modalda).
  payments: { key: PaymentKey; label: string; amount: number }[];
}

// Bir sipariş kümesini OverviewMetric'e indirger (iptal hariç + net).
function reduceMetric(
  orders: { status: string; total: number; source?: OrderSource; method?: PaymentKey }[],
): OverviewMetric {
  let revenue = 0;
  let net = 0;
  let orderCount = 0;
  let cancelledCount = 0;
  for (const o of orders) {
    if (o.status === "cancelled") {
      cancelledCount++;
      continue;
    }
    orderCount++;
    revenue += o.total;
    net += estimateOrderNet(o.total, o.source, o.method === "meal_card");
  }
  return {
    revenue,
    net,
    orderCount,
    avgBasket: orderCount > 0 ? revenue / orderCount : 0,
    cancelledCount,
  };
}

export async function getDashboardOverview(
  period: DashboardPeriod = "day",
  source: OrderSource | "all" = "all",
  dayOffset = 0,
): Promise<DashboardOverview> {
  await connectDB();

  const w = periodWindows(period, dayOffset);
  const sourceFilter = buildSourceFilter(source);

  // Mevcut dönem: ürün/kanal/ödeme/bölge detayı için zengin select.
  // Önceki dönem: sadece kıyas → hafif select.
  const [curOrders, prevOrders] = await Promise.all([
    OrderModel.find({
      ...sourceFilter,
      createdAt: { $gte: new Date(w.start), $lt: new Date(w.end) },
    })
      .select({
        status: 1,
        total: 1,
        source: 1,
        createdAt: 1,
        "payment.method": 1,
        "items.quantity": 1,
        "items.totalPrice": 1,
        "items.product.name": 1,
      })
      .lean(),
    OrderModel.find({
      ...sourceFilter,
      createdAt: { $gte: new Date(w.prevStart), $lt: new Date(w.prevEnd) },
    })
      .select({ status: 1, total: 1, source: 1, "payment.method": 1 })
      .lean(),
  ]);

  // ─── Kıyas için metrikler ───────────────────────────────────
  const norm = (o: unknown) => {
    const r = o as {
      status: string;
      total: number;
      source?: OrderSource;
      payment?: { method?: PaymentKey };
    };
    return {
      status: r.status,
      total: r.total,
      source: r.source,
      method: r.payment?.method,
    };
  };

  const current = reduceMetric(curOrders.map(norm));
  const previous = reduceMetric(prevOrders.map(norm));

  // ─── Trend buckets ──────────────────────────────────────────
  const trendMap = new Map<number, { revenue: number; orders: number }>();
  const bucketKeys: number[] = [];
  if (w.buckets === "hour") {
    for (let h = 0; h < 24; h++) {
      trendMap.set(h, { revenue: 0, orders: 0 });
      bucketKeys.push(h);
    }
  } else {
    // Pencere başından itibaren gün gün (offset>0'da da doğru).
    for (let i = 0; i < w.days; i++) {
      const dayStart = w.start + i * DAY_MS;
      trendMap.set(dayStart, { revenue: 0, orders: 0 });
      bucketKeys.push(dayStart);
    }
  }

  // ─── Ürün / kanal / ödeme / bölge toplulaştırma (mevcut dönem) ──
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  const channelMap = new Map<OrderSource, { revenue: number; orderCount: number }>();
  const paymentMap = new Map<PaymentKey, number>();

  for (const raw of curOrders) {
    const o = raw as unknown as {
      status: string;
      total: number;
      source?: OrderSource;
      createdAt: Date | string;
      payment?: { method?: PaymentKey };
      items?: { quantity: number; totalPrice: number; product?: { name?: string } }[];
    };
    if (o.status === "cancelled") continue;

    const src = (o.source ?? "manual") as OrderSource;
    const ch = channelMap.get(src) ?? { revenue: 0, orderCount: 0 };
    ch.revenue += o.total;
    ch.orderCount++;
    channelMap.set(src, ch);

    const method = o.payment?.method;
    if (method) paymentMap.set(method, (paymentMap.get(method) ?? 0) + o.total);

    for (const it of o.items ?? []) {
      const name = it.product?.name ?? "—";
      const p = productMap.get(name) ?? { quantity: 0, revenue: 0 };
      p.quantity += it.quantity;
      p.revenue += it.totalPrice;
      productMap.set(name, p);
    }

    // Trend bucket
    const ms =
      o.createdAt instanceof Date ? o.createdAt.getTime() : new Date(o.createdAt).getTime();
    if (w.buckets === "hour") {
      const hour = new Date(ms + ISTANBUL_OFFSET_MS).getUTCHours();
      const b = trendMap.get(hour);
      if (b) {
        b.revenue += o.total;
        b.orders++;
      }
    } else {
      // Siparişin Istanbul günü başlangıcını bul
      const istDayStart = istanbulDayStart(ms).getTime();
      const b = trendMap.get(istDayStart);
      if (b) {
        b.revenue += o.total;
        b.orders++;
      }
    }
  }

  const trend = bucketKeys.map((key) => {
    const b = trendMap.get(key)!;
    const label =
      w.buckets === "hour"
        ? `${String(key).padStart(2, "0")}:00`
        : new Date(key + ISTANBUL_OFFSET_MS).toLocaleDateString("tr-TR", {
            day: "numeric",
            month: "short",
          });
    return { label, revenue: b.revenue, orders: b.orders };
  });

  // Komuta merge'i için tam liste; tüketiciler kendi limitini uygular.
  const topProducts = [...productMap.entries()]
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 50);

  const channels = [...channelMap.entries()]
    .map(([src, d]) => ({
      source: src,
      label: CHANNEL_LABELS[src] ?? src,
      revenue: d.revenue,
      orderCount: d.orderCount,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Ödeme listesi — yemek kartı tek toplam (marka detayı modalda).
  const payments = (Object.keys(PAYMENT_LABELS) as PaymentKey[])
    .map((method) => ({
      key: method,
      label: PAYMENT_LABELS[method],
      amount: paymentMap.get(method) ?? 0,
    }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    period,
    dayOffset: Math.max(0, Math.min(365, Math.floor(dayOffset))),
    current,
    previous,
    trend,
    topProducts,
    channels,
    payments,
  };
}

// ─── Dönem siparişleri (KPI kartına tıklayınca açılan liste) ────────────────
const METHOD_LABELS: Record<PaymentKey, string> = PAYMENT_LABELS;

export interface PeriodOrderRow {
  id: string;
  orderNumber: number;
  customerName: string;
  district: string | null;
  time: string; // HH:MM (Istanbul)
  total: number;
  net: number;
  paymentLabel: string; // "Nakit" / "Yemek K. · Multinet" …
  status: string;
}

export async function getPeriodOrders(
  period: DashboardPeriod = "day",
  source: OrderSource | "all" = "all",
  dayOffset = 0,
  method?: PaymentKey, // verilirse sadece o ödeme yöntemi
): Promise<PeriodOrderRow[]> {
  await connectDB();

  const w = periodWindows(period, dayOffset);
  const orders = await OrderModel.find({
    ...buildSourceFilter(source),
    createdAt: { $gte: new Date(w.start), $lt: new Date(w.end) },
    ...(method ? { "payment.method": method } : {}),
  })
    .select({
      id: 1,
      orderNumber: 1,
      status: 1,
      total: 1,
      source: 1,
      createdAt: 1,
      "customer.name": 1,
      "customer.district": 1,
      "payment.method": 1,
      "payment.mealCardBrand": 1,
    })
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  return orders.map((raw) => {
    const o = raw as unknown as {
      id: string;
      orderNumber: number;
      status: string;
      total: number;
      source?: OrderSource;
      createdAt: Date | string;
      customer?: { name?: string; district?: string };
      payment?: { method?: PaymentKey; mealCardBrand?: string };
    };
    const ms =
      o.createdAt instanceof Date ? o.createdAt.getTime() : new Date(o.createdAt).getTime();
    const ist = new Date(ms + ISTANBUL_OFFSET_MS);
    const time = `${String(ist.getUTCHours()).padStart(2, "0")}:${String(
      ist.getUTCMinutes(),
    ).padStart(2, "0")}`;

    const method = o.payment?.method;
    const paymentLabel =
      method === "meal_card"
        ? `Yemek K. · ${MEAL_BRAND_LABELS[(o.payment?.mealCardBrand ?? "").toLowerCase()] ?? "Diğer"}`
        : method
          ? METHOD_LABELS[method]
          : "—";

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer?.name ?? "—",
      district: (o.customer?.district ?? "").trim() || null,
      time,
      total: o.total,
      net: estimateOrderNet(o.total, o.source, method === "meal_card"),
      paymentLabel,
      status: o.status,
    };
  });
}

// ─── Sipariş pinleri (harita) ───────────────────────────────────────────────
// Siparişin kendi geo'su yoksa müşteri kaydındaki (telefon) pini kullan —
// kurye/sipariş ekranlarıyla aynı fallback. Pin yoksa harita dışında kalır.
export interface OverviewPins {
  pins: RegionPin[];
  pinnedCount: number;
  totalOrders: number;
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

function finiteCoord(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export async function getOverviewPins(
  period: DashboardPeriod = "day",
  source: OrderSource | "all" = "all",
  dayOffset = 0,
): Promise<OverviewPins> {
  await connectDB();

  const w = periodWindows(period, dayOffset);
  const orders = await OrderModel.find({
    ...buildSourceFilter(source),
    createdAt: { $gte: new Date(w.start), $lt: new Date(w.end) },
    status: { $ne: "cancelled" },
  })
    .select({
      id: 1,
      orderNumber: 1,
      status: 1,
      total: 1,
      createdAt: 1,
      "customer.phone": 1,
      "customer.district": 1,
      "customer.geo": 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  type Row = {
    id: string;
    orderNumber: number;
    status: string;
    total: number;
    createdAt: Date | string;
    customer?: { phone?: string; district?: string; geo?: { lat?: number; lng?: number } };
  };
  const rows = orders as unknown as Row[];

  // Kendi geo'su olmayan siparişler için telefon→geo fallback.
  const phonesNeedingGeo = [
    ...new Set(
      rows
        .filter((o) => finiteCoord(o.customer?.geo?.lat) === null)
        .map((o) => o.customer?.phone)
        .filter((p): p is string => !!p),
    ),
  ];
  const geoByPhone = new Map<string, { lat: number; lng: number }>();
  if (phonesNeedingGeo.length > 0) {
    const custs = await CustomerModel.find({ phone: { $in: phonesNeedingGeo } })
      .select({ phone: 1, geo: 1 })
      .lean();
    for (const c of custs) {
      const rec = c as unknown as { phone: string; geo?: { lat?: number; lng?: number } };
      const lat = finiteCoord(rec.geo?.lat);
      const lng = finiteCoord(rec.geo?.lng);
      if (lat !== null && lng !== null) geoByPhone.set(rec.phone, { lat, lng });
    }
  }

  const pins: RegionPin[] = [];
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

  for (const o of rows) {
    let lat = finiteCoord(o.customer?.geo?.lat);
    let lng = finiteCoord(o.customer?.geo?.lng);
    if (lat === null || lng === null) {
      const fb = o.customer?.phone ? geoByPhone.get(o.customer.phone) : undefined;
      if (fb) {
        lat = fb.lat;
        lng = fb.lng;
      }
    }
    if (lat === null || lng === null) continue;

    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;

    const ms =
      o.createdAt instanceof Date ? o.createdAt.getTime() : new Date(o.createdAt).getTime();
    pins.push({
      id: o.id,
      orderNumber: `${o.orderNumber}`,
      lat,
      lng,
      district: (o.customer?.district ?? "").trim() || undefined,
      neighborhood: undefined,
      total: o.total,
      status: o.status,
      createdAt: ms,
    });
  }

  return {
    pins,
    pinnedCount: pins.length,
    totalOrders: rows.length,
    bounds: pins.length > 0 ? { minLat, maxLat, minLng, maxLng } : undefined,
  };
}
