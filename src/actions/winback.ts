"use server";

import { randomUUID } from "node:crypto";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import CustomerModel from "@/models/Customer";
import SettingModel from "@/models/Setting";
import WinbackModel from "@/models/Winback";
import { phoneKey } from "@/lib/utils";
import { istanbulDayStart } from "@/lib/datetime";
import {
  DEFAULT_WINBACK_SETTINGS,
  WINBACK_RETURNED_VISIBLE_DAYS,
  WINBACK_STATS_DAYS,
  type WinbackBoard,
  type WinbackCallResult,
  type WinbackContactView,
  type WinbackHint,
  type WinbackMethod,
  type WinbackRow,
  type WinbackSettings,
  type WinbackStats,
} from "@/lib/winback";

const SETTINGS_KEY = "winbackSettings";
const DAY_MS = 24 * 60 * 60 * 1000;

type LeanOrder = {
  customer: { phone: string };
  createdAt: Date;
  total: number;
  items?: { product?: { name?: string }; quantity?: number }[];
};

type LeanContact = {
  id: string;
  at: Date;
  method: WinbackMethod;
  templateTitle?: string;
  message?: string;
  note?: string;
  result?: WinbackCallResult;
};

type LeanWinback = {
  key: string;
  phone: string;
  optOut?: boolean;
  snoozeUntil?: Date;
  contacts?: LeanContact[];
};

// ─── Ayarlar ─────────────────────────────────────────────────────────────────

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeSettings(raw: Partial<WinbackSettings> | undefined): WinbackSettings {
  const d = DEFAULT_WINBACK_SETTINGS;
  const lapsedDays = clampInt(raw?.lapsedDays, 7, 180, d.lapsedDays);
  const templates = (raw?.templates ?? d.templates)
    .map((t) => ({
      id: t.id || randomUUID(),
      title: String(t.title ?? "").trim(),
      text: String(t.text ?? "").trim(),
    }))
    .filter((t) => t.title && t.text);
  return {
    minOrders: clampInt(raw?.minOrders, 2, 20, d.minOrders),
    lapsedDays,
    maxDays: clampInt(raw?.maxDays, lapsedDays + 1, 730, d.maxDays),
    waitDays: clampInt(raw?.waitDays, 3, 60, d.waitDays),
    templates: templates.length > 0 ? templates : d.templates,
  };
}

async function readSettings(): Promise<WinbackSettings> {
  const doc = await SettingModel.findOne({ key: SETTINGS_KEY }).select("value").lean();
  return normalizeSettings((doc as { value?: Partial<WinbackSettings> } | null)?.value);
}

export async function saveWinbackSettings(
  input: WinbackSettings,
): Promise<{ ok: boolean; settings?: WinbackSettings; error?: string }> {
  try {
    if (!input.templates.some((t) => t.title.trim() && t.text.trim())) {
      return { ok: false, error: "En az bir mesaj şablonu gerekli" };
    }
    const settings = normalizeSettings(input);
    await connectDB();
    await SettingModel.updateOne(
      { key: SETTINGS_KEY },
      { $set: { value: settings } },
      { upsert: true },
    );
    return { ok: true, settings };
  } catch (error) {
    console.error("[saveWinbackSettings]", error);
    return { ok: false, error: "Ayarlar kaydedilemedi" };
  }
}

// ─── Liste ───────────────────────────────────────────────────────────────────

// Kayıttaki isim çoğu zaman telefonun kendisi — harf içermiyorsa isim yok say.
function realName(name: string | undefined): string | null {
  if (!name) return null;
  const t = name.trim();
  return /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(t) ? t : null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function toContactView(c: LeanContact): WinbackContactView {
  return {
    id: c.id,
    at: new Date(c.at).toISOString(),
    method: c.method,
    templateTitle: c.templateTitle,
    message: c.message,
    note: c.note,
    result: c.result,
  };
}

// Tüm liste her açılışta siparişlerden hesaplanır (kendi kanal; Trendyol'da
// müşteri telefonu gizli olduğu için ulaşılamaz). Birkaç bin sipariş için
// hafif bir okuma — önbellek/ayrı tablo gerekmez, hep güncel kalır.
export async function getWinbackBoard(): Promise<WinbackBoard> {
  await connectDB();
  const now = Date.now();

  const [settings, orderDocs, customerDocs, winbackDocs] = await Promise.all([
    readSettings(),
    OrderModel.find(
      { status: { $ne: "cancelled" }, source: { $in: ["manual", null] } },
      { "customer.phone": 1, createdAt: 1, total: 1, "items.product.name": 1, "items.quantity": 1 },
    )
      .sort({ createdAt: 1 })
      .lean(),
    CustomerModel.find({}, { name: 1, phone: 1, address: 1 }).lean(),
    WinbackModel.find({}).lean(),
  ]);

  // Telefon → siparişler (createdAt artan)
  const byKey = new Map<string, { phone: string; orders: LeanOrder[] }>();
  for (const o of orderDocs as unknown as LeanOrder[]) {
    const key = phoneKey(o.customer?.phone ?? "");
    // 10 hane değilse ya da "2222222222" gibi uydurma numaraysa atla.
    if (key.length !== 10 || new Set(key.slice(1)).size === 1) continue;
    let g = byKey.get(key);
    if (!g) {
      g = { phone: o.customer.phone, orders: [] };
      byKey.set(key, g);
    }
    g.orders.push(o);
  }

  const customers = new Map<string, { name?: string; phone: string; address?: string }>();
  for (const c of customerDocs as unknown as { name?: string; phone: string; address?: string }[]) {
    customers.set(phoneKey(c.phone), c);
  }
  const winbacks = new Map<string, LeanWinback>();
  for (const w of winbackDocs as unknown as LeanWinback[]) winbacks.set(w.key, w);

  const { minOrders, lapsedDays, maxDays, waitDays } = settings;
  // status null: listede görünmez ama eski bir geri dönüşü var (istatistik için).
  const rows: (Omit<WinbackRow, "status"> & { status: WinbackRow["status"] | null })[] = [];

  for (const [key, { phone, orders }] of byKey) {
    const times = orders.map((o) => new Date(o.createdAt).getTime());
    const first = times[0];
    const last = times[times.length - 1];
    const n = orders.length;
    const total = orders.reduce((s, o) => s + (o.total ?? 0), 0);
    const daysSince = Math.floor((now - last) / DAY_MS);

    // Alışkanlık: ardışık siparişler arası günlerin ortancası (≥ 2 aralık gerekir).
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / DAY_MS);
    const usualGapDays = gaps.length >= 2 ? Math.max(1, Math.round(median(gaps))) : null;

    // Aktif olduğu süre boyunca aylık ortalama (en az 1 ay üzerinden — 1 haftada
    // 3 sipariş veren "ayda 12" sayılmasın).
    const spanDays = Math.max(30, (last - first) / DAY_MS);
    const monthlyValue = Math.round((total * 30) / spanDays);

    // Segment — sipariş alışkanlığına göre.
    let segment: WinbackRow["segment"] = null;
    if (daysSince <= maxDays) {
      if (n >= minOrders && daysSince >= lapsedDays) segment = "lapsed";
      else if (
        n >= minOrders &&
        usualGapDays !== null &&
        daysSince >= Math.max(7, usualGapDays * 2)
      )
        segment = "at_risk";
      else if (n < minOrders && daysSince >= lapsedDays) segment = "occasional";
    }

    const wb = winbacks.get(key);
    const contacts = [...(wb?.contacts ?? [])].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    // "Açmadı" denemesi ulaşma sayılmaz; durum son GERÇEK ulaşmaya göre.
    const lastReal = contacts.find((c) => c.result !== "no_answer") ?? null;
    const lastContact = contacts[0] ?? null;

    let status: WinbackRow["status"] | null = null;
    let returned: WinbackRow["returned"] = null;
    if (lastReal) {
      const at = new Date(lastReal.at).getTime();
      const after = orders.filter((o) => new Date(o.createdAt).getTime() > at);
      const firstAfter = after[0] ? new Date(after[0].createdAt).getTime() : null;
      if (firstAfter !== null && firstAfter - at <= waitDays * DAY_MS) {
        returned = {
          at: new Date(firstAfter).toISOString(),
          daysAfterContact: Math.floor((firstAfter - at) / DAY_MS),
          orders: after.length,
          revenue: after.reduce((s, o) => s + (o.total ?? 0), 0),
        };
        if (now - at <= WINBACK_RETURNED_VISIBLE_DAYS * DAY_MS) status = "returned";
      } else if (after.length === 0 && now - at < waitDays * DAY_MS) {
        status = "contacted";
      }
    }

    const snoozed = wb?.snoozeUntil && new Date(wb.snoozeUntil).getTime() > now;
    if (status !== "returned" && (wb?.optOut || snoozed)) status = "excluded";
    if (!status) status = segment;
    if (!status && !returned) continue;

    const c = customers.get(key);
    const favCount = new Map<string, number>();
    for (const o of orders) {
      for (const it of o.items ?? []) {
        const name = it.product?.name;
        if (name) favCount.set(name, (favCount.get(name) ?? 0) + (it.quantity ?? 1));
      }
    }

    rows.push({
      key,
      // Siparişlerdeki numara — sipariş geçmişi bu biçimle eşleşir.
      phone,
      name: realName(c?.name),
      address: c?.address?.trim() || null,
      orders: n,
      total,
      avgBasket: Math.round(total / n),
      monthlyValue,
      lastAt: new Date(last).toISOString(),
      daysSince,
      usualGapDays,
      favorites: [...favCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name]) => name),
      status,
      segment,
      lastContact: lastContact ? toContactView(lastContact) : null,
      lastReachedAt: lastReal ? new Date(lastReal.at).toISOString() : null,
      contactCount: contacts.length,
      returned,
      excluded:
        status === "excluded"
          ? {
              optOut: !!wb?.optOut,
              snoozeUntil: snoozed ? new Date(wb!.snoozeUntil!).toISOString() : null,
            }
          : null,
    });
  }

  const since = now - WINBACK_STATS_DAYS * DAY_MS;
  const stats: WinbackStats = {
    atRisk: 0,
    lapsed: 0,
    lapsedMonthlyValue: 0,
    occasional: 0,
    contacted30: 0,
    waiting30: 0,
    returned30: 0,
    returnedRevenue30: 0,
    contactedToday: 0,
  };
  const todayStart = istanbulDayStart(now).getTime();
  for (const w of winbacks.values()) {
    for (const c of w.contacts ?? []) {
      if (new Date(c.at).getTime() >= todayStart) stats.contactedToday++;
    }
  }
  for (const r of rows) {
    if (r.status === "at_risk") stats.atRisk++;
    if (r.status === "lapsed") {
      stats.lapsed++;
      stats.lapsedMonthlyValue += r.monthlyValue;
    }
    if (r.status === "occasional") stats.occasional++;
    if (r.lastReachedAt && new Date(r.lastReachedAt).getTime() >= since) {
      stats.contacted30++;
      if (r.status === "contacted") stats.waiting30++;
      if (r.returned) {
        stats.returned30++;
        stats.returnedRevenue30 += r.returned.revenue;
      }
    }
  }

  return {
    settings,
    rows: rows.filter((r): r is WinbackRow => r.status !== null),
    stats,
  };
}

// ─── Ulaşma kaydı ────────────────────────────────────────────────────────────

export async function recordWinbackContact(input: {
  phone: string;
  method: WinbackMethod;
  templateTitle?: string;
  message?: string;
  note?: string;
  result?: WinbackCallResult;
}): Promise<{ ok: boolean; contactId?: string; error?: string }> {
  try {
    const key = phoneKey(input.phone);
    if (key.length !== 10) return { ok: false, error: "Geçersiz telefon" };
    await connectDB();
    const contact = {
      id: randomUUID(),
      at: new Date(),
      method: input.method,
      templateTitle: input.templateTitle?.trim() || undefined,
      message: input.message?.trim() || undefined,
      note: input.note?.trim() || undefined,
      result: input.method === "call" ? input.result : undefined,
    };
    await WinbackModel.updateOne(
      { key },
      {
        $setOnInsert: { key, phone: input.phone },
        $push: { contacts: contact },
        // "İstemiyor" → bir daha listelenmesin.
        ...(input.result === "negative" ? { $set: { optOut: true } } : {}),
      },
      { upsert: true },
    );
    return { ok: true, contactId: contact.id };
  } catch (error) {
    console.error("[recordWinbackContact]", error);
    return { ok: false, error: "Kaydedilemedi" };
  }
}

// Yanlışlıkla kaydedilen ulaşmayı geri al. "İstemiyor" kaydıysa onun koyduğu
// hariç tutma da kalkar — geri al, kayıttan önceki hâle döndürmeli.
export async function deleteWinbackContact(phone: string, contactId: string): Promise<void> {
  const key = phoneKey(phone);
  await connectDB();
  const wb = (await WinbackModel.findOne({ key }).lean()) as LeanWinback | null;
  const contact = wb?.contacts?.find((c) => c.id === contactId);
  if (!contact) return;
  await WinbackModel.updateOne(
    { key },
    {
      $pull: { contacts: { id: contactId } },
      ...(contact.result === "negative" ? { $set: { optOut: false } } : {}),
    },
  );
}

// ─── Erteleme / hariç tutma ──────────────────────────────────────────────────

export async function snoozeWinback(phone: string, days: number): Promise<void> {
  const key = phoneKey(phone);
  await connectDB();
  await WinbackModel.updateOne(
    { key },
    {
      $setOnInsert: { key, phone },
      $set: { snoozeUntil: new Date(Date.now() + days * DAY_MS) },
    },
    { upsert: true },
  );
}

export async function setWinbackOptOut(phone: string, optOut: boolean): Promise<void> {
  const key = phoneKey(phone);
  await connectDB();
  await WinbackModel.updateOne(
    { key },
    { $setOnInsert: { key, phone }, $set: { optOut } },
    { upsert: true },
  );
}

// Hariç/ertelenmiş müşteriyi listeye geri al.
export async function restoreWinback(phone: string): Promise<void> {
  await connectDB();
  await WinbackModel.updateOne(
    { key: phoneKey(phone) },
    { $set: { optOut: false }, $unset: { snoozeUntil: 1 } },
  );
}

// ─── Yeni sipariş ekranı hatırlatması ────────────────────────────────────────
// Müşteriye bekleme süresi içinde ulaşıldıysa ve o günden beri sipariş
// vermediyse: bu sipariş "geri dönüş" — verilen söz (indirim/ikram) unutulmasın.
export async function getWinbackHint(phone: string): Promise<WinbackHint | null> {
  const key = phoneKey(phone);
  if (key.length !== 10) return null;
  await connectDB();
  const wb = (await WinbackModel.findOne({ key }).lean()) as LeanWinback | null;
  const contact = [...(wb?.contacts ?? [])]
    .filter((c) => c.result !== "no_answer" && c.result !== "negative")
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
  if (!contact) return null;

  const { waitDays } = await readSettings();
  const at = new Date(contact.at);
  if (Date.now() - at.getTime() > waitDays * DAY_MS) return null;

  // Ulaşıldıktan sonra zaten sipariş verdiyse söz kullanılmış sayılır.
  const phoneRegex = new RegExp(`${key.split("").join("\\D*")}$`);
  const orderedSince = await OrderModel.exists({
    "customer.phone": phoneRegex,
    status: { $ne: "cancelled" },
    createdAt: { $gt: at },
  });
  if (orderedSince) return null;

  return {
    at: at.toISOString(),
    method: contact.method,
    templateTitle: contact.templateTitle,
    message: contact.message,
    note: contact.note,
  };
}
