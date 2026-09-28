"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";
import ContactSyncLogModel from "@/models/ContactSyncLog";
import {
  patchGoogleContactsSetting,
  readGoogleContactsSetting,
} from "@/lib/integrations/googleContacts";

const MULTI_COURIER_KEY = "multiCourierMode";
const SHOP_LOCATION_KEY = "shopLocation";
const SHOP_IBAN_KEY = "shopIban";
const MONTHLY_TARGET_KEY = "monthlyRevenueTarget";
const DELIVERY_TARGET_KEY = "deliveryTargetMin";

export interface ShopLocation {
  lat: number;
  lng: number;
}

// Dükkanın tahsilat IBAN'ı — kurye "IBAN" ödeme seçtiğinde müşteriye gösterilir
// veya WhatsApp ile gönderilir. Ayarlar'dan bir kez girilir.
export interface ShopIban {
  name: string; // IBAN sahibi ad soyad / ünvan
  iban: string; // boşluksuz, büyük harf (TR...)
}

// Girilen IBAN'ı normalize eder: boşlukları siler, büyük harfe çevirir.
function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export async function getShopIban(): Promise<ShopIban | null> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: SHOP_IBAN_KEY })
      .select("value")
      .lean();
    const value = (doc as unknown as { value?: ShopIban })?.value;
    if (value && value.iban && value.name) {
      return { name: value.name, iban: value.iban };
    }
    return null;
  } catch (error) {
    console.error("[getShopIban]", error);
    return null;
  }
}

export async function setShopIban(
  data: ShopIban,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const name = data.name.trim();
    const iban = normalizeIban(data.iban);
    if (name.length < 2) {
      return { ok: false, error: "Ad soyad gerekli" };
    }
    // TR IBAN: "TR" + 24 rakam = 26 karakter. Esnek tutuyoruz ama temel kontrol.
    if (!/^TR\d{24}$/.test(iban)) {
      return { ok: false, error: "Geçersiz IBAN (TR + 24 rakam olmalı)" };
    }
    await connectDB();
    await SettingModel.updateOne(
      { key: SHOP_IBAN_KEY },
      { $set: { value: { name, iban } } },
      { upsert: true },
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[setShopIban]", error);
    return { ok: false, error: "IBAN kaydedilemedi" };
  }
}

// Dükkanın koordinatı — kurye ekranında müşteri pinine kuş uçuşu uzaklığı
// hesaplamak için kullanılır. Bir kez Ayarlar'dan haritayla pinlenir.
export async function getShopLocation(): Promise<ShopLocation | null> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: SHOP_LOCATION_KEY })
      .select("value")
      .lean();
    const value = (doc as unknown as { value?: ShopLocation })?.value;
    if (
      value &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng)
    ) {
      return { lat: value.lat, lng: value.lng };
    }
    return null;
  } catch (error) {
    console.error("[getShopLocation]", error);
    return null;
  }
}

export async function setShopLocation(
  loc: ShopLocation,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (
      !Number.isFinite(loc.lat) ||
      !Number.isFinite(loc.lng) ||
      Math.abs(loc.lat) > 90 ||
      Math.abs(loc.lng) > 180
    ) {
      return { ok: false, error: "Geçersiz konum" };
    }
    await connectDB();
    await SettingModel.updateOne(
      { key: SHOP_LOCATION_KEY },
      { $set: { value: { lat: loc.lat, lng: loc.lng } } },
      { upsert: true },
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[setShopLocation]", error);
    return { ok: false, error: "Konum kaydedilemedi" };
  }
}

// Aylık ciro hedefi — dashboard'da "Bu Ay" ilerleme çubuğu için. 0/boş = hedef
// yok (çubuk gizlenir). Ayarlar'dan girilir.
export async function getMonthlyTarget(): Promise<number> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: MONTHLY_TARGET_KEY })
      .select("value")
      .lean();
    const value = Number((doc as unknown as { value?: number })?.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    console.error("[getMonthlyTarget]", error);
    return 0;
  }
}

export async function setMonthlyTarget(
  target: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!Number.isFinite(target) || target < 0) {
      return { ok: false, error: "Geçersiz hedef" };
    }
    await connectDB();
    await SettingModel.updateOne(
      { key: MONTHLY_TARGET_KEY },
      { $set: { value: Math.round(target) } },
      { upsert: true },
    );
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[setMonthlyTarget]", error);
    return { ok: false, error: "Hedef kaydedilemedi" };
  }
}

// Kurye teslim hedefi (dakika) — Komuta › Performans'ta "hedefi aşan" oranı ve
// grafiklerdeki hedef çizgisi bu değerden. Girilmemişse varsayılan.
const DEFAULT_DELIVERY_TARGET_MIN = 35;

export async function getDeliveryTargetMin(): Promise<number> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: DELIVERY_TARGET_KEY })
      .select("value")
      .lean();
    const value = Number((doc as unknown as { value?: number })?.value);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_DELIVERY_TARGET_MIN;
  } catch (error) {
    console.error("[getDeliveryTargetMin]", error);
    return DEFAULT_DELIVERY_TARGET_MIN;
  }
}

export async function setDeliveryTargetMin(
  minutes: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!Number.isFinite(minutes) || minutes < 10 || minutes > 120) {
      return { ok: false, error: "Hedef 10–120 dk arasında olmalı" };
    }
    await connectDB();
    await SettingModel.updateOne(
      { key: DELIVERY_TARGET_KEY },
      { $set: { value: Math.round(minutes) } },
      { upsert: true },
    );
    return { ok: true };
  } catch (error) {
    console.error("[setDeliveryTargetMin]", error);
    return { ok: false, error: "Hedef kaydedilemedi" };
  }
}

// Çoklu kurye modu: açıkken kurye uygulamasında "üstlen / havuz" sistemi görünür;
// kapalıyken tek-kurye sade akış (tüm paketler doğrudan teslimatta). Varsayılan kapalı.
export async function getMultiCourierMode(): Promise<boolean> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: MULTI_COURIER_KEY })
      .select("value")
      .lean();
    return Boolean((doc as unknown as { value?: boolean })?.value);
  } catch (error) {
    console.error("[getMultiCourierMode]", error);
    return false;
  }
}

export async function setMultiCourierMode(
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();
    await SettingModel.updateOne(
      { key: MULTI_COURIER_KEY },
      { $set: { value: on } },
      { upsert: true },
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[setMultiCourierMode]", error);
    return { ok: false, error: "Ayar kaydedilemedi" };
  }
}

// ─── Google Kişiler bağlantısı ──────────────────────────────────────────────
// Client secret ve refresh token tarayıcıya hiç gönderilmez; ekran yalnız
// "girilmiş mi / bağlı mı / hangi hesap" bilgisini görür.
export interface GoogleContactsStatus {
  clientId: string;
  hasSecret: boolean;
  connected: boolean;
  email?: string;
  connectedAt?: string;
  lastSync?: {
    at: string;
    created: number;
    updated?: number;
    completed?: number;
    skipped: number;
    duplicates?: number;
    error?: string;
  };
}

export async function getGoogleContactsStatus(): Promise<GoogleContactsStatus> {
  const s = await readGoogleContactsSetting();
  return {
    clientId: s.clientId ?? "",
    hasSecret: Boolean(s.clientSecret),
    connected: Boolean(s.clientId && s.clientSecret && s.refreshToken),
    email: s.email,
    connectedAt: s.connectedAt ? new Date(s.connectedAt).toISOString() : undefined,
    lastSync: s.lastSync
      ? { ...s.lastSync, at: new Date(s.lastSync.at).toISOString() }
      : undefined,
  };
}

// Secret boş bırakılırsa mevcut olan korunur (ekranda gösterilmediği için).
export async function saveGoogleContactsClient(data: {
  clientId: string;
  clientSecret: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const clientId = data.clientId.trim();
    const clientSecret = data.clientSecret.trim();
    if (!clientId.endsWith(".apps.googleusercontent.com")) {
      return { ok: false, error: "Client ID '.apps.googleusercontent.com' ile bitmeli" };
    }
    const current = await readGoogleContactsSetting();
    if (!clientSecret && !current.clientSecret) {
      return { ok: false, error: "Client Secret gerekli" };
    }
    const clientChanged = current.clientId && current.clientId !== clientId;
    await patchGoogleContactsSetting(
      { clientId, ...(clientSecret ? { clientSecret } : {}) },
      // Başka bir OAuth istemcisine geçildiyse eski token onunla çalışmaz.
      clientChanged ? ["refreshToken", "email", "connectedAt"] : [],
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[saveGoogleContactsClient]", error);
    return { ok: false, error: "Kaydedilemedi" };
  }
}

export async function disconnectGoogleContacts(): Promise<{ ok: boolean }> {
  try {
    await patchGoogleContactsSetting({}, ["refreshToken", "email", "connectedAt"]);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[disconnectGoogleContacts]", error);
    return { ok: false };
  }
}

// ─── Google Kişiler gönderim geçmişi ────────────────────────────────────────
export type SyncTriggerLabel = "new-customer" | "cron" | "manual-new" | "manual-all";

export interface ContactSyncRun {
  id: string;
  at: string;
  trigger: SyncTriggerLabel;
  ok: boolean;
  error?: string;
  durationMs?: number;
  created: number;
  updated: number;
  completed: number;
  skipped: number;
  duplicates: number;
  itemCount: number;
}

export interface ContactSyncLogItem {
  at: string;
  trigger: SyncTriggerLabel;
  customerId?: string;
  name: string;
  phone: string;
  action: "created" | "updated" | "completed";
  fields?: string[];
  previousName?: string;
}

// Son gönderimler (kişi listesi olmadan — bir Düzelt turunda 1000+ satır olabilir).
export async function getContactSyncRuns(limit = 50): Promise<ContactSyncRun[]> {
  await connectDB();
  const docs = await ContactSyncLogModel.aggregate([
    { $sort: { at: -1 } },
    { $limit: Math.min(limit, 200) },
    { $addFields: { itemCount: { $size: "$items" } } },
    { $project: { items: 0 } },
  ]);
  return docs.map((d) => ({
    id: String(d._id),
    at: new Date(d.at).toISOString(),
    trigger: d.trigger,
    ok: d.ok,
    error: d.error,
    durationMs: d.durationMs,
    created: d.created ?? 0,
    updated: d.updated ?? 0,
    completed: d.completed ?? 0,
    skipped: d.skipped ?? 0,
    duplicates: d.duplicates ?? 0,
    itemCount: d.itemCount ?? 0,
  }));
}

// Tek gönderimde değişen kişiler.
export async function getContactSyncRunItems(id: string): Promise<ContactSyncLogItem[]> {
  if (!/^[a-f0-9]{24}$/.test(id)) return [];
  await connectDB();
  const doc = (await ContactSyncLogModel.findById(id).lean()) as {
    at: Date;
    trigger: SyncTriggerLabel;
    items?: Omit<ContactSyncLogItem, "at" | "trigger">[];
  } | null;
  if (!doc) return [];
  return (doc.items ?? []).map((it) => ({
    ...it,
    at: new Date(doc.at).toISOString(),
    trigger: doc.trigger,
  }));
}

// İsim ya da numarayla arama: "bu müşteri rehbere ne zaman gitti?"
export async function searchContactSyncLog(query: string): Promise<ContactSyncLogItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  // Numara: son 10 haneye kadar parça eşleşmesi ("0532 111", "5321112233").
  const match =
    digits.length >= 3 && digits.length >= q.replace(/\s/g, "").length - 1
      ? { "items.phone": { $regex: digits.replace(/^0/, "").slice(-10) } }
      : {
          "items.name": {
            $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
          },
        };
  await connectDB();
  const docs = await ContactSyncLogModel.aggregate([
    { $match: match },
    { $sort: { at: -1 } },
    { $limit: 200 },
    { $unwind: "$items" },
    { $match: match },
    { $limit: 100 },
    { $project: { _id: 0, at: 1, trigger: 1, item: "$items" } },
  ]);
  return docs.map((d) => ({
    ...d.item,
    at: new Date(d.at).toISOString(),
    trigger: d.trigger,
  }));
}
