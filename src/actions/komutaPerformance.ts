"use server";

// Komuta › Performans veri katmanı — ürün satış hareketi ve kurye teslim süreleri.
//
// Kaynaklar: kendi siparişler (Order) + Trendyol arşivi (TrendyolOrder). Trendyol
// API'sine ek istek yok; arşiv zaten ürün satırlarını ve teslim süresini tutuyor.
//
// Kıyas mantığı:
//  - "Önceki": bir önceki denk dönem. Gün görünümünde DÜN değil, geçen haftanın
//    AYNI GÜNÜ (restoranda salı ile cumartesi kıyaslanmaz).
//  - "Normal": önceki 4 denk dönemin ortalaması. Düşüş/yükseliş buna göre
//    ölçülür; tek kötü dönem yanıltmasın.
//  - Güncel dönem henüz bitmediyse (bugün 14:00) önceki dönemler de aynı
//    uzunlukta kesilir → yarım gün ile tam gün kıyaslanmaz.

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import TrendyolOrderModel from "@/models/TrendyolOrder";
import { ensureTrendyolArchiveFresh, LIVE_MAX_AGE_MS } from "@/lib/trendyol/archive";
import { periodWindows, DAY_MS, ISTANBUL_OFFSET_MS, type DashboardPeriod } from "@/lib/dashboardPeriods";
import { courierKey, productKey, titleCaseTr } from "@/lib/performanceNames";
import { type OrderSource } from "@/types";
import { getDeliveryTargetMin } from "./settings";

type Channel = OrderSource | "all";

const HISTORY = 8; // mini grafik: güncel + 7 önceki denk dönem
const BASELINE = 4; // "normal" = önceki 4 dönemin ortalaması
const CHANGE_PCT = 25; // bu oranı aşan değişim düşüş/yükseliş sayılır
// Az satan ürün gürültüsü: 2'den 1'e inmek "%50 düşüş" sayılmasın. Ürünün
// normalde dönem başına en az bu kadar satması gerekir.
const MIN_BASE: Record<DashboardPeriod, number> = { day: 3, week: 10, month: 30 };
// Bu süreden uzun teslim kayıtları hatalı sayılır (geç kapatılmış sipariş vb.).
const MAX_VALID_MIN = 180;
const TY_CANCELLED = ["Cancelled", "UnSupplied"];

// ─── Dönem pencereleri ───────────────────────────────────────────────────────
interface Win {
  start: number;
  end: number;
  label: string;
}

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Istanbul",
  });
}

// k=0 güncel, k=1.. geriye doğru denk dönemler (hepsi güncel dönem uzunluğunda).
function comparableWindows(period: DashboardPeriod, offset: number, n: number): Win[] {
  const cur = periodWindows(period, offset);
  const len = cur.end - cur.start;
  const step = (period === "month" ? 30 : 7) * DAY_MS;
  return Array.from({ length: n }, (_, k) => {
    const start = cur.start - k * step;
    return { start, end: start + len, label: dateLabel(start) };
  });
}

function windowIndex(wins: Win[], ms: number): number {
  for (let k = 0; k < wins.length; k++) {
    if (ms >= wins[k].start && ms < wins[k].end) return k;
  }
  return -1;
}

function compareLabels(period: DashboardPeriod): { prev: string; base: string } {
  if (period === "day") return { prev: "geçen hafta aynı gün", base: "son 4 haftanın aynı günü" };
  if (period === "week") return { prev: "geçen hafta", base: "son 4 hafta" };
  return { prev: "önceki 30 gün", base: "son 4 ay" };
}

// ─── Kanal filtreleri ────────────────────────────────────────────────────────
function ownSourceFilter(channel: Channel): Record<string, unknown> {
  return channel === "all"
    ? {}
    : channel === "manual"
      ? { $or: [{ source: "manual" }, { source: { $exists: false } }] }
      : { source: channel };
}

const wantOwn = (c: Channel) => c !== "trendyol";
const wantTy = (c: Channel) => c === "all" || c === "trendyol";

async function freshTrendyol(offset: number) {
  await ensureTrendyolArchiveFresh(offset === 0 ? { maxAgeMs: LIVE_MAX_AGE_MS } : {});
}

// ═══ ÜRÜNLER ═════════════════════════════════════════════════════════════════
export interface ChannelAmount {
  qty: number;
  revenue: number;
}

export type ProductStatus = "down" | "up" | "new" | "stopped" | "steady";

export interface ProductPerfRow {
  key: string;
  name: string;
  /** Birleştirilen farklı yazımlar (ör. Trendyol'daki ad). */
  variants: string[];
  qty: number;
  revenue: number;
  own: ChannelAmount;
  trendyol: ChannelAmount;
  prevQty: number;
  baseAvg: number;
  /** Normale (4 dönem ort.) göre % değişim; normal 0 ise null. */
  changePct: number | null;
  status: ProductStatus;
  /** Eskiden yeniye; son eleman güncel dönem. */
  history: { label: string; own: number; trendyol: number }[];
  lastSoldAt: number | null;
}

export interface ProductPerformance {
  prevLabel: string;
  baseLabel: string;
  minBase: number;
  changeThreshold: number;
  totals: {
    qty: number;
    revenue: number;
    prevQty: number;
    prevRevenue: number;
    baseQty: number;
  };
  rows: ProductPerfRow[];
}

interface Acc {
  names: Map<string, { qty: number; own: boolean }>;
  hist: { own: ChannelAmount; trendyol: ChannelAmount }[];
  lastSoldAt: number;
}

export async function getProductPerformance(
  period: DashboardPeriod = "week",
  channel: Channel = "all",
  offset = 0,
): Promise<ProductPerformance> {
  const wins = comparableWindows(period, offset, HISTORY);
  const from = new Date(wins[HISTORY - 1].start);
  const to = new Date(wins[0].end);

  if (wantTy(channel)) await freshTrendyol(offset);
  await connectDB();

  type OwnRow = {
    createdAt: Date;
    items?: { product?: { name?: string }; quantity?: number; totalPrice?: number }[];
  };
  type TyRow = {
    packageCreationDate?: Date;
    lines?: { name?: string; quantity?: number; unitSellingPrice?: number }[];
  };

  const [own, ty] = await Promise.all([
    wantOwn(channel)
      ? (OrderModel.find({
          ...ownSourceFilter(channel),
          status: { $ne: "cancelled" },
          createdAt: { $gte: from, $lt: to },
        })
          .select({ createdAt: 1, "items.product.name": 1, "items.quantity": 1, "items.totalPrice": 1 })
          .lean() as unknown as Promise<OwnRow[]>)
      : Promise.resolve([] as OwnRow[]),
    wantTy(channel)
      ? (TrendyolOrderModel.find({
          packageCreationDate: { $gte: from, $lt: to },
          packageStatus: { $nin: TY_CANCELLED },
        })
          .select({ packageCreationDate: 1, lines: 1 })
          .lean() as unknown as Promise<TyRow[]>)
      : Promise.resolve([] as TyRow[]),
  ]);

  const map = new Map<string, Acc>();
  const add = (name: string | undefined, qty: number, revenue: number, ms: number, isOwn: boolean) => {
    if (!name || !(qty > 0)) return;
    const k = windowIndex(wins, ms);
    if (k < 0) return;
    const key = productKey(name);
    if (!key) return;
    let a = map.get(key);
    if (!a) {
      a = {
        names: new Map(),
        hist: wins.map(() => ({ own: { qty: 0, revenue: 0 }, trendyol: { qty: 0, revenue: 0 } })),
        lastSoldAt: 0,
      };
      map.set(key, a);
    }
    const n = a.names.get(name) ?? { qty: 0, own: isOwn };
    n.qty += qty;
    a.names.set(name, n);
    const slot = isOwn ? a.hist[k].own : a.hist[k].trendyol;
    slot.qty += qty;
    slot.revenue += revenue;
    if (ms > a.lastSoldAt) a.lastSoldAt = ms;
  };

  for (const o of own) {
    const ms = new Date(o.createdAt).getTime();
    for (const it of o.items ?? []) add(it.product?.name, it.quantity ?? 0, it.totalPrice ?? 0, ms, true);
  }
  for (const o of ty) {
    const ms = o.packageCreationDate ? new Date(o.packageCreationDate).getTime() : 0;
    for (const l of o.lines ?? []) {
      const q = l.quantity ?? 1;
      add(l.name, q, (l.unitSellingPrice ?? 0) * q, ms, false);
    }
  }

  const minBase = MIN_BASE[period];
  const totals = { qty: 0, revenue: 0, prevQty: 0, prevRevenue: 0, baseQty: 0 };
  const rows: ProductPerfRow[] = [];

  for (const [key, a] of map) {
    const q = (k: number) => a.hist[k].own.qty + a.hist[k].trendyol.qty;
    const r = (k: number) => a.hist[k].own.revenue + a.hist[k].trendyol.revenue;
    let baseSum = 0;
    for (let k = 1; k <= BASELINE; k++) baseSum += q(k);
    const qty = q(0);
    if (qty === 0 && baseSum === 0) continue; // yalnız çok eski dönemlerde satmış

    const baseAvg = baseSum / BASELINE;
    const changePct = baseAvg > 0 ? ((qty - baseAvg) / baseAvg) * 100 : null;

    let status: ProductStatus = "steady";
    if (qty === 0 && baseSum >= minBase) status = "stopped";
    else if (baseSum === 0 && qty > 0) status = "new";
    else if (changePct !== null && baseAvg >= minBase && changePct <= -CHANGE_PCT) status = "down";
    else if (changePct !== null && Math.max(qty, baseAvg) >= minBase && changePct >= CHANGE_PCT) status = "up";

    // Görünen ad: kendi menüdeki en çok satan yazım; yoksa Trendyol'daki.
    const names = [...a.names.entries()].sort(
      (x, y) => Number(y[1].own) - Number(x[1].own) || y[1].qty - x[1].qty,
    );
    const name = names[0][0];

    rows.push({
      key,
      name,
      variants: names.slice(1).map(([n]) => n),
      qty,
      revenue: r(0),
      own: { ...a.hist[0].own },
      trendyol: { ...a.hist[0].trendyol },
      prevQty: q(1),
      baseAvg,
      changePct,
      status,
      history: a.hist
        .map((h, k) => ({ label: wins[k].label, own: h.own.qty, trendyol: h.trendyol.qty }))
        .reverse(),
      lastSoldAt: a.lastSoldAt || null,
    });

    totals.qty += qty;
    totals.revenue += r(0);
    totals.prevQty += q(1);
    totals.prevRevenue += r(1);
    totals.baseQty += baseAvg;
  }

  rows.sort((x, y) => y.qty - x.qty || y.baseAvg - x.baseAvg);
  const labels = compareLabels(period);
  return {
    prevLabel: labels.prev,
    baseLabel: labels.base,
    minBase,
    changeThreshold: CHANGE_PCT,
    totals,
    rows,
  };
}

// ═══ KURYELER ════════════════════════════════════════════════════════════════
export interface SlowOrder {
  id: string | null; // kendi sipariş id (linklenir); Trendyol'da null
  orderNumber: string;
  channel: "own" | "trendyol";
  courier: string | null;
  minutes: number;
  at: number;
  when: string; // "22 Eyl 19:42"
  district: string | null;
}

export interface CourierSeriesPoint {
  label: string;
  avg: number | null;
  count: number;
}

export interface CourierPerfRow {
  key: string;
  name: string;
  count: number;
  own: number;
  trendyol: number;
  avg: number;
  median: number;
  fastest: number;
  slowest: number;
  overTarget: number;
  prevAvg: number | null;
  prevCount: number;
  series: CourierSeriesPoint[];
  slowOrders: SlowOrder[];
}

export interface CourierPerformance {
  target: number;
  prevLabel: string;
  seriesUnit: "hour" | "day";
  totals: {
    count: number;
    avg: number | null;
    median: number | null;
    overTarget: number;
    prevAvg: number | null;
    prevOverTargetPct: number | null;
  };
  rows: CourierPerfRow[];
  /** Kurye adı girilmemiş teslimler (ör. Trendyol'un kendi saatinden gelenler). */
  unassigned: { count: number; avg: number } | null;
  hourly: { hour: number; avg: number; count: number }[];
  buckets: { label: string; from: number; to: number | null; count: number }[];
  /** 180 dk'yı aşan, hatalı sayılıp hesaba katılmayan kayıt sayısı. */
  excluded: number;
  slowOrders: SlowOrder[];
}

interface Delivery {
  id: string | null;
  orderNumber: string;
  channel: "own" | "trendyol";
  courier: string | null;
  minutes: number;
  at: number;
  district: string | null;
}

const BUCKETS: { label: string; from: number; to: number | null }[] = [
  { label: "20 dk altı", from: 0, to: 20 },
  { label: "20–30 dk", from: 20, to: 30 },
  { label: "30–40 dk", from: 30, to: 40 },
  { label: "40–50 dk", from: 40, to: 50 },
  { label: "50–60 dk", from: 50, to: 60 },
  { label: "60 dk üstü", from: 60, to: null },
];

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function istHour(ms: number): number {
  return new Date(ms + ISTANBUL_OFFSET_MS).getUTCHours();
}

function whenLabel(ms: number): string {
  const ist = new Date(ms + ISTANBUL_OFFSET_MS);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${dateLabel(ms)} ${hh}:${mm}`;
}

function toSlow(d: Delivery): SlowOrder {
  return { ...d, when: whenLabel(d.at) };
}

export async function getCourierPerformance(
  period: DashboardPeriod = "week",
  channel: Channel = "all",
  offset = 0,
): Promise<CourierPerformance> {
  const [cur, prev] = comparableWindows(period, offset, 2);
  const from = new Date(prev.start);
  const to = new Date(cur.end);

  if (wantTy(channel)) await freshTrendyol(offset);
  await connectDB();

  type OwnRow = {
    id: string;
    orderNumber: number;
    createdAt: Date;
    deliveryDurationMin?: number;
    courier?: string | null;
    customer?: { district?: string };
  };
  type TyRow = {
    orderNumber: string;
    packageCreationDate?: Date;
    deliveryDurationMin?: number;
    courier?: string | null;
    neighborhood?: string;
    district?: string;
  };

  const [target, own, ty] = await Promise.all([
    getDeliveryTargetMin(),
    wantOwn(channel)
      ? (OrderModel.find({
          ...ownSourceFilter(channel),
          status: "delivered",
          deliveryDurationMin: { $gt: 0 },
          createdAt: { $gte: from, $lt: to },
        })
          .select({ id: 1, orderNumber: 1, createdAt: 1, deliveryDurationMin: 1, courier: 1, "customer.district": 1 })
          .lean() as unknown as Promise<OwnRow[]>)
      : Promise.resolve([] as OwnRow[]),
    // Yalnız bizim kuryenin taşıdığı paketler (STORE). GO = Trendyol kuryesi.
    wantTy(channel)
      ? (TrendyolOrderModel.find({
          deliveryType: "STORE",
          deliveryDurationMin: { $gt: 0 },
          packageStatus: { $nin: TY_CANCELLED },
          packageCreationDate: { $gte: from, $lt: to },
        })
          .select({
            orderNumber: 1,
            packageCreationDate: 1,
            deliveryDurationMin: 1,
            courier: 1,
            neighborhood: 1,
            district: 1,
          })
          .lean() as unknown as Promise<TyRow[]>)
      : Promise.resolve([] as TyRow[]),
  ]);

  const all: Delivery[] = [
    ...own.map((o) => ({
      id: o.id,
      orderNumber: String(o.orderNumber),
      channel: "own" as const,
      courier: o.courier?.trim() || null,
      minutes: o.deliveryDurationMin ?? 0,
      at: new Date(o.createdAt).getTime(),
      district: o.customer?.district || null,
    })),
    ...ty.map((o) => ({
      id: null,
      orderNumber: o.orderNumber,
      channel: "trendyol" as const,
      courier: o.courier?.trim() || null,
      minutes: o.deliveryDurationMin ?? 0,
      at: o.packageCreationDate ? new Date(o.packageCreationDate).getTime() : 0,
      district: o.neighborhood || o.district || null,
    })),
  ];

  let excluded = 0;
  const curRows: Delivery[] = [];
  const prevRows: Delivery[] = [];
  for (const d of all) {
    const inCur = d.at >= cur.start && d.at < cur.end;
    const inPrev = d.at >= prev.start && d.at < prev.end;
    if (!inCur && !inPrev) continue;
    if (d.minutes > MAX_VALID_MIN) {
      if (inCur) excluded++;
      continue;
    }
    (inCur ? curRows : prevRows).push(d);
  }

  // Dönem içi seri: gün görünümünde saat saat, diğerlerinde gün gün.
  const seriesUnit: "hour" | "day" = period === "day" ? "hour" : "day";
  const dayCount = Math.max(1, Math.ceil((cur.end - cur.start) / DAY_MS));
  const seriesKey = (ms: number) =>
    seriesUnit === "hour" ? istHour(ms) : Math.floor((ms - cur.start) / DAY_MS);
  const seriesLabel = (i: number) =>
    seriesUnit === "hour" ? `${String(i).padStart(2, "0")}:00` : dateLabel(cur.start + i * DAY_MS);

  const buildSeries = (ds: Delivery[]): CourierSeriesPoint[] => {
    const m = new Map<number, number[]>();
    for (const d of ds) {
      const k = seriesKey(d.at);
      const arr = m.get(k) ?? [];
      arr.push(d.minutes);
      m.set(k, arr);
    }
    let keys: number[];
    if (seriesUnit === "day") keys = Array.from({ length: dayCount }, (_, i) => i);
    else {
      const hs = [...m.keys()];
      if (hs.length === 0) return [];
      keys = [];
      for (let h = Math.min(...hs); h <= Math.max(...hs); h++) keys.push(h);
    }
    return keys.map((k) => {
      const arr = m.get(k) ?? [];
      return { label: seriesLabel(k), avg: arr.length ? Math.round(avgOf(arr)) : null, count: arr.length };
    });
  };

  const slowest = (ds: Delivery[], n: number) =>
    [...ds].sort((a, b) => b.minutes - a.minutes).slice(0, n).map(toSlow);

  // Kurye bazında grupla (ad büyük/küçük harf duyarsız).
  const groups = new Map<string, { names: Map<string, number>; cur: Delivery[]; prev: Delivery[] }>();
  const unassignedCur: Delivery[] = [];
  const pushGroup = (d: Delivery, isCur: boolean) => {
    if (!d.courier) {
      if (isCur) unassignedCur.push(d);
      return;
    }
    const key = courierKey(d.courier);
    const g = groups.get(key) ?? { names: new Map(), cur: [], prev: [] };
    g.names.set(d.courier, (g.names.get(d.courier) ?? 0) + 1);
    (isCur ? g.cur : g.prev).push(d);
    groups.set(key, g);
  };
  for (const d of curRows) pushGroup(d, true);
  for (const d of prevRows) pushGroup(d, false);

  const rows: CourierPerfRow[] = [];
  for (const [key, g] of groups) {
    if (g.cur.length === 0) continue;
    const mins = g.cur.map((d) => d.minutes).sort((a, b) => a - b);
    const displayName = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    rows.push({
      key,
      name: titleCaseTr(displayName),
      count: mins.length,
      own: g.cur.filter((d) => d.channel === "own").length,
      trendyol: g.cur.filter((d) => d.channel === "trendyol").length,
      avg: avgOf(mins),
      median: median(mins),
      fastest: mins[0],
      slowest: mins[mins.length - 1],
      overTarget: mins.filter((m) => m > target).length,
      prevAvg: g.prev.length ? avgOf(g.prev.map((d) => d.minutes)) : null,
      prevCount: g.prev.length,
      series: buildSeries(g.cur),
      slowOrders: slowest(g.cur, 8),
    });
  }
  rows.sort((a, b) => b.count - a.count);

  const curMins = curRows.map((d) => d.minutes).sort((a, b) => a - b);
  const prevMins = prevRows.map((d) => d.minutes);

  const hourMap = new Map<number, number[]>();
  for (const d of curRows) {
    const h = istHour(d.at);
    const arr = hourMap.get(h) ?? [];
    arr.push(d.minutes);
    hourMap.set(h, arr);
  }
  const hourly = [...hourMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, arr]) => ({ hour, avg: Math.round(avgOf(arr)), count: arr.length }));

  const buckets = BUCKETS.map((b) => ({
    ...b,
    count: curMins.filter((m) => m >= b.from && (b.to === null || m < b.to)).length,
  }));

  return {
    target,
    prevLabel: compareLabels(period).prev,
    seriesUnit,
    totals: {
      count: curMins.length,
      avg: curMins.length ? avgOf(curMins) : null,
      median: curMins.length ? median(curMins) : null,
      overTarget: curMins.filter((m) => m > target).length,
      prevAvg: prevMins.length ? avgOf(prevMins) : null,
      prevOverTargetPct: prevMins.length
        ? (prevMins.filter((m) => m > target).length / prevMins.length) * 100
        : null,
    },
    rows,
    unassigned: unassignedCur.length
      ? { count: unassignedCur.length, avg: avgOf(unassignedCur.map((d) => d.minutes)) }
      : null,
    hourly,
    buckets,
    excluded,
    slowOrders: slowest(curRows, 10),
  };
}
