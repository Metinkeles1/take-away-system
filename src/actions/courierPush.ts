"use server";

import webpush from "web-push";
import { connectDB } from "@/lib/mongodb";
import CourierModel from "@/models/Courier";
import CourierPushSubscriptionModel from "@/models/CourierPushSubscription";
import SettingModel from "@/models/Setting";
import { getCourierCallEnabled } from "@/actions/settings";

// Kurye çağır — Web Push. Kurye telefonu abone olur (savePushSubscription),
// panel seçtiği kuryelere bildirim gönderir (callCouriers). Bildirim yalnızca
// AKTİF kuryelere ve bildirimi açık (abone) cihazlara gider; pasif kurye ya da
// bildirimi açmamış kurye hiçbir şey almaz.

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface CourierPushStatus {
  name: string;
  devices: number;
}

export interface CallCouriersResult {
  ok: boolean;
  error?: string;
  sentCouriers?: string[]; // en az bir cihazına ulaşan kuryeler
  failedCouriers?: string[]; // hiçbir cihazına ulaşılamayanlar
}

// Aynı kuryeye/kuryelere arka arkaya basılırsa telefon susmadan yeni bildirim
// yağmasın diye kısa bekleme.
const CALL_COOLDOWN_MS = 8_000;
const MAX_MESSAGE = 120;

let vapidReady: boolean | null = null;
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!pub || !priv) {
    console.warn("[courierPush] VAPID env eksik — kurye bildirimi devre dışı");
    vapidReady = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidReady = true;
  return true;
}

function isValidSubscription(sub: unknown): sub is PushSubscriptionInput {
  const s = sub as PushSubscriptionInput | null;
  return Boolean(
    s &&
      typeof s.endpoint === "string" &&
      s.endpoint.startsWith("https://") &&
      typeof s.keys?.p256dh === "string" &&
      typeof s.keys?.auth === "string",
  );
}

// Kurye telefonu bildirimleri açınca (ve her açılışta tazelemek için) çağrılır.
export async function savePushSubscription(
  courierName: string,
  sub: PushSubscriptionInput,
  userAgent?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const name = courierName.trim();
    if (!name) return { ok: false, error: "Kurye adı yok" };
    if (!isValidSubscription(sub)) return { ok: false, error: "Geçersiz abonelik" };
    await connectDB();
    await CourierPushSubscriptionModel.updateOne(
      { endpoint: sub.endpoint },
      {
        $set: {
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          courierName: name,
          userAgent: userAgent?.slice(0, 300),
        },
      },
      { upsert: true },
    );
    return { ok: true };
  } catch (error) {
    console.error("[savePushSubscription]", error);
    return { ok: false, error: "Bildirim kaydı yapılamadı" };
  }
}

// Kurye bildirimleri kapatınca.
export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  try {
    await connectDB();
    await CourierPushSubscriptionModel.deleteOne({ endpoint });
    return { ok: true };
  } catch (error) {
    console.error("[removePushSubscription]", error);
    return { ok: false };
  }
}

// Panel listesi: aktif kuryeler + her birinin bildirimi açık cihaz sayısı.
export async function getCourierPushStatus(): Promise<{
  configured: boolean;
  couriers: CourierPushStatus[];
}> {
  const configured = ensureVapid();
  try {
    await connectDB();
    const [couriers, counts] = await Promise.all([
      CourierModel.find({ active: true }).sort({ name: 1 }).lean(),
      CourierPushSubscriptionModel.aggregate<{ _id: string; n: number }>([
        { $group: { _id: "$courierName", n: { $sum: 1 } } },
      ]),
    ]);
    const byName = new Map(counts.map((c) => [c._id, c.n]));
    return {
      configured,
      couriers: (couriers as unknown as { name: string }[]).map((c) => ({
        name: c.name,
        devices: byName.get(c.name) ?? 0,
      })),
    };
  } catch (error) {
    console.error("[getCourierPushStatus]", error);
    return { configured, couriers: [] };
  }
}

// Atomik bekleme: aynı hedefe kısa süre içinde ikinci çağrı reddedilir
// (bkz. trendyolCourier claimAutoSyncSlot — aynı desen).
async function claimCallSlot(targetKey: string): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - CALL_COOLDOWN_MS);
  try {
    const doc = await SettingModel.findOneAndUpdate(
      {
        key: `push:call:${targetKey}`,
        $or: [{ value: { $lt: cutoff } }, { value: { $exists: false } }],
      },
      { $set: { value: now } },
      { upsert: true, new: true },
    );
    return Boolean(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

// Seçilen kuryelere bildirim gönderir. Pasif ya da bildirimi açmamış kuryeler
// sessizce atlanır. Geçersiz olmuş abonelikler (telefon izni kaldırdı, uygulama
// silindi) gönderim sırasında temizlenir.
export async function callCouriers(
  courierNames: string[],
  message?: string,
): Promise<CallCouriersResult> {
  if (!ensureVapid()) {
    return { ok: false, error: "Bildirim ayarı eksik (VAPID anahtarları tanımlı değil)" };
  }
  if (!(await getCourierCallEnabled())) {
    return { ok: false, error: "Kurye çağır Ayarlar’dan kapatılmış" };
  }
  const names = [...new Set(courierNames.map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) return { ok: false, error: "Kurye seçilmedi" };

  try {
    await connectDB();
    const activeDocs = await CourierModel.find({ active: true, name: { $in: names } })
      .select({ name: 1 })
      .lean();
    const activeNames = (activeDocs as unknown as { name: string }[]).map((c) => c.name);
    if (activeNames.length === 0) return { ok: false, error: "Seçilen kuryeler aktif değil" };

    if (!(await claimCallSlot([...activeNames].sort().join("|")))) {
      return { ok: false, error: "Az önce çağrıldı, birkaç saniye bekleyin" };
    }

    const subs = await CourierPushSubscriptionModel.find({
      courierName: { $in: activeNames },
    }).lean();
    if (subs.length === 0) {
      return { ok: false, error: "Seçilen kuryelerin bildirimi açık değil" };
    }

    const body = (message?.trim() || "Paketler hazır, mutfağa gel").slice(0, MAX_MESSAGE);
    const payload = JSON.stringify({
      title: "🛵 Kurye çağrısı",
      body,
      url: "/kurye",
      at: Date.now(),
    });

    const reached = new Set<string>();
    const dead: string[] = [];
    await Promise.all(
      (subs as unknown as (PushSubscriptionInput & { courierName: string })[]).map(
        async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: s.keys },
              payload,
              // Kurye 2 dk içinde telefonu açmazsa (ağ yok vb.) bildirimin bayat
              // haliyle sonradan düşmesi anlamsız.
              { TTL: 120, urgency: "high", topic: "kurye-cagir" },
            );
            reached.add(s.courierName);
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) dead.push(s.endpoint);
            else console.warn("[callCouriers] gönderim hatası", code, err);
          }
        },
      ),
    );
    if (dead.length) {
      await CourierPushSubscriptionModel.deleteMany({ endpoint: { $in: dead } });
    }

    const sentCouriers = activeNames.filter((n) => reached.has(n));
    const failedCouriers = activeNames.filter((n) => !reached.has(n));
    if (sentCouriers.length === 0) {
      return { ok: false, error: "Bildirim hiçbir telefona ulaşmadı", failedCouriers };
    }
    return { ok: true, sentCouriers, failedCouriers };
  } catch (error) {
    console.error("[callCouriers]", error);
    return { ok: false, error: "Bildirim gönderilemedi" };
  }
}
