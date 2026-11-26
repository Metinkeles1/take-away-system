import "server-only";

// Mutfak istasyonu fişleri (bkz. stationTypes.ts). Siparişin ürünleri
// kategorisine göre istasyonlara bölünür; her istasyon için bir fiş, o
// istasyonun bilgisayarına + yazıcısına hedeflenmiş olarak kasa programının
// kuyruğuna (TrendyolAutoJob, kind "station") girer. Anahtar
// "<sipariş>:st:<istasyon>" unique → aynı sipariş aynı istasyona bir kez basılır.
//
// Kategori: panel siparişinde ürünün kendi kategorisi. Trendyol / Yemeksepeti
// ürünlerinde kategori yok → ad menüdeki ürünlerle eşleştirilir (tam ad, sonra
// "içinde geçen" en uzun ürün adı, sonra kategori adı: "… Pide" → pide).
// Hiç eşleşmeyen ürün yedek istasyona "(?)" işaretiyle düşer.

import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";
import ProductModel from "@/models/Product";
import OrderModel from "@/models/Order";
import YemeksepetiOrderModel from "@/models/YemeksepetiOrder";
import TrendyolAutoJobModel from "@/models/TrendyolAutoJob";
import type { TrendyolPackage } from "@/lib/integrations/trendyol/client";
import { lineCustomization } from "@/lib/integrations/trendyol/packageUtils";
import { mapTrendyolPackageToOrder } from "@/lib/integrations/trendyol/courierMap";
import { ysDocToOrder, type YsOrderDoc } from "@/lib/yemeksepeti/toOrder";
import { getMenuCategories } from "@/actions/menuCategories";
import type { OrderItem } from "@/types";
import {
  buildStationTestTicket,
  buildStationTicket,
  type StationTicketItem,
  type StationTicketOrder,
} from "./receipt";
import { defaultStationConfig, type PrintStation, type PrintStationConfig } from "./stationTypes";

const KEY = "printStations";
// Platform siparişi bundan eskiyse bölünmez (özellik yeni açılınca eskiler basılmasın).
const LOOKBACK_MS = 45 * 60_000;

export async function readStationConfig(): Promise<PrintStationConfig> {
  await connectDB();
  const doc = await SettingModel.findOne({ key: KEY }).lean<{ value?: Partial<PrintStationConfig> }>();
  const d = defaultStationConfig();
  const v = doc?.value;
  if (!v) return d;
  return {
    ...d,
    ...v,
    stations: Array.isArray(v.stations) ? (v.stations as PrintStation[]) : d.stations,
  };
}

export async function writeStationConfig(cfg: PrintStationConfig): Promise<void> {
  await connectDB();
  await SettingModel.updateOne({ key: KEY }, { $set: { value: cfg } }, { upsert: true });
}

export function stationsActive(cfg: PrintStationConfig): boolean {
  return cfg.enabled && cfg.stations.some((s) => s.deviceId);
}

// ─── Platform ürün adı → menü kategorisi ────────────────────────────────────

const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/[^0-9a-zçğıöşü]/g, "");

type Matcher = (name: string) => string | null;
let matcherCache: { at: number; fn: Matcher } | null = null;

async function catalogMatcher(): Promise<Matcher> {
  if (matcherCache && Date.now() - matcherCache.at < 60_000) return matcherCache.fn;
  await connectDB();
  const [products, categories] = await Promise.all([
    ProductModel.find({}, { name: 1, category: 1 }).lean<{ name: string; category: string }[]>(),
    getMenuCategories().catch(() => []),
  ]);
  const exact = new Map<string, string>();
  const partial: { n: string; category: string }[] = [];
  for (const p of products) {
    const n = norm(p.name ?? "");
    if (!n) continue;
    if (!exact.has(n)) exact.set(n, p.category);
    if (n.length >= 4) partial.push({ n, category: p.category });
  }
  partial.sort((a, b) => b.n.length - a.n.length);
  const catKeys = categories
    .flatMap((c) => [norm(c.label), norm(c.value)].map((n) => ({ n, value: c.value })))
    .filter((c) => c.n.length >= 3)
    .sort((a, b) => b.n.length - a.n.length);

  const fn: Matcher = (name) => {
    const n = norm(name);
    if (!n) return null;
    return (
      exact.get(n) ??
      partial.find((p) => n.includes(p.n))?.category ??
      catKeys.find((c) => n.includes(c.n))?.value ??
      null
    );
  };
  matcherCache = { at: Date.now(), fn };
  return fn;
}

// ─── Bölme + kuyruk ─────────────────────────────────────────────────────────

// category: null = bilinmiyor (menüde bulunamadı) → yedek istasyon.
type RoutedItem = { category: string | null; ticket: StationTicketItem };

async function queueStationTickets(
  cfg: PrintStationConfig,
  key: string,
  order: StationTicketOrder,
  items: RoutedItem[],
): Promise<number> {
  const stationOf = new Map<string, string>();
  for (const s of cfg.stations) for (const c of s.categories) stationOf.set(c, s.id);

  const byStation = new Map<string, StationTicketItem[]>();
  for (const it of items) {
    const sid = it.category === null ? cfg.fallbackStationId : stationOf.get(it.category);
    if (!sid) continue; // istasyonu olmayan kategori (içecek, tatlı…) → yalnız kasa fişi
    const ticket = it.category === null ? { ...it.ticket, unmatched: true } : it.ticket;
    byStation.set(sid, [...(byStation.get(sid) ?? []), ticket]);
  }

  let queued = 0;
  for (const s of cfg.stations) {
    const own = byStation.get(s.id);
    if (!own?.length || !s.deviceId) continue;
    const others = cfg.stations
      .filter((o) => o.id !== s.id && (byStation.get(o.id)?.length ?? 0) > 0)
      .map((o) => ({ name: o.name, count: byStation.get(o.id)!.length }));
    try {
      await TrendyolAutoJobModel.updateOne(
        { packageId: `${key}:st:${s.id}` },
        {
          $setOnInsert: {
            kind: "station",
            orderNumber: order.number,
            accountName: `${s.name} · ${order.source}`,
            targetDevice: s.deviceId,
            printerName: s.printerName,
            printQueuedAt: new Date(),
            receipt: buildStationTicket(s.name, order, own, others),
          },
        },
        { upsert: true },
      );
      queued++;
    } catch (err) {
      // Aynı anda iki istek: unique hatası = zaten kuyrukta.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  return queued;
}

function recentEnough(cfg: PrintStationConfig, at: Date): boolean {
  const since = Math.max(new Date(cfg.enabledAt).getTime(), Date.now() - LOOKBACK_MS);
  return at.getTime() >= since;
}

function panelItem(it: OrderItem, category: string | null): RoutedItem {
  const portion = it.portion && it.portion.size !== "full" ? ` (${it.portion.label})` : "";
  return {
    category,
    ticket: {
      qty: String(it.quantity ?? 1),
      name: `${it.product?.name ?? "Ürün"}${portion}`,
      details: (it.options ?? []).filter(Boolean),
      removed: [],
      note: it.note?.trim() || undefined,
    },
  };
}

// Panelden girilen sipariş ("Tamamla + Yazdır").
export async function queueOrderStations(orderId: string): Promise<number> {
  const cfg = await readStationConfig();
  if (!stationsActive(cfg)) return 0;
  await connectDB();
  const doc = await OrderModel.findOne({ id: orderId })
    .select("orderNumber items notes createdAt")
    .lean<{ orderNumber: number; items: OrderItem[]; notes?: string; createdAt?: Date }>();
  if (!doc) return 0;
  return queueStationTickets(
    cfg,
    `order-${orderId}`,
    { source: "PANEL", number: String(doc.orderNumber), createdAt: doc.createdAt ?? new Date(), notes: doc.notes },
    (doc.items ?? []).map((it) => panelItem(it, it.product?.category ?? null)),
  );
}

// Trendyol paketi (kasa programının yoklamasında, kabulden sonra).
export async function queueTrendyolStations(
  cfg: PrintStationConfig,
  p: TrendyolPackage,
  accountName: string,
): Promise<void> {
  if (!stationsActive(cfg) || !recentEnough(cfg, new Date(p.packageCreationDate))) return;
  const match = await catalogMatcher();
  const items: RoutedItem[] = p.lines.map((line) => {
    const c = lineCustomization(line);
    return {
      category: match(line.name),
      ticket: {
        qty: String(line.items?.length || 1),
        name: line.name,
        details: [...c.modifiers, ...c.extras].map((m) => m.name),
        removed: c.removed,
      },
    };
  });
  await queueStationTickets(
    cfg,
    `ty-${p.id}`,
    {
      source: `TRENDYOL · ${accountName}`,
      number: String(p.orderNumber),
      createdAt: new Date(p.packageCreationDate),
      notes: mapTrendyolPackageToOrder(p).notes,
    },
    items,
  );
}

// Yemeksepeti canlı siparişleri (eklenti yakaladıkça).
export async function queueYemeksepetiStations(orderIds: string[]): Promise<void> {
  if (!orderIds.length) return;
  const cfg = await readStationConfig();
  if (!stationsActive(cfg)) return;
  await connectDB();
  const docs = await YemeksepetiOrderModel.find({ orderId: { $in: orderIds } }).lean<YsOrderDoc[]>();
  const match = await catalogMatcher();
  for (const d of docs) {
    if (!d.placedAt || !recentEnough(cfg, new Date(d.placedAt))) continue;
    // Henüz kabul edilmemiş (NEW) ya da iptal → basma; kabul edilince durum
    // değişir, eklenti yeniden gönderir ve o zaman basılır (Trendyol ile aynı).
    const state = (d.liveState ?? "").toUpperCase();
    if (!state || state === "NEW" || state === "CANCELLED") continue;
    const o = ysDocToOrder(d);
    if (!o.items.length) continue;
    await queueStationTickets(
      cfg,
      `ys-${d.orderId}`,
      { source: "YEMEKSEPETİ", number: o.orderCode ?? String(o.orderNumber), createdAt: o.createdAt, notes: o.notes },
      o.items.map((it) => panelItem(it, match(it.product.name))),
    );
  }
}

// Ayarlar'dan "Deneme fişi": yalnız o istasyonun bilgisayarı, o yazıcıya basar.
export async function queueStationTest(s: PrintStation): Promise<void> {
  await connectDB();
  const now = new Date();
  await TrendyolAutoJobModel.create({
    packageId: `test-st-${s.id}-${now.getTime()}`,
    kind: "test",
    accountName: `${s.name} istasyonu`,
    targetDevice: s.deviceId,
    printerName: s.printerName,
    printQueuedAt: now,
    receipt: buildStationTestTicket(s.name, s.printerName),
  });
}
