import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";
import YemeksepetiOrderModel from "@/models/YemeksepetiOrder";
import YemeksepetiDispatchLogModel from "@/models/YemeksepetiDispatchLog";

// Otomatik "yola çıktı": kurye bizde "Yola çıktım" deyince sipariş kuyruğa
// girer; kasadaki eklenti kuyruğu alır ve Yemeksepeti panelinin kendi
// oturumuyla PUT …/deliveries/{oma_id}/state gönderir.
//
// İsteğin İÇERİĞİ henüz bilinmiyor (sadece yanıtları gördük: state → CLOSED).
// Bu yüzden tahmini içerikler sırayla denenir; ilk 2xx'te durulur (iki durum
// değişikliği üst üste binmesin). Her deneme YemeksepetiDispatchLog'a yazılır.
// Kasada elle "yola çıktı"ya basılınca eklenti panelin GERÇEK içeriğini öğrenir
// ("learned") → sonraki siparişlerde ilk o denenir.

const AUTO_KEY = "ysAutoDispatch"; // aç/kapa (varsayılan açık)
const PREFERRED_KEY = "ysDispatchPreferred"; // en son tutan içerik adı
const LEARNED_KEY = "ysDispatchLearned"; // { body, liveId, orderId, at }

const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 saatten eski istek gönderilmez
const LEASE_MS = 90 * 1000; // eklenti aldıktan sonra cevap bekleme süresi
const MAX_ATTEMPTS = 2; // aynı sipariş için en fazla 2 tur

const BASE = "https://vendor-api-tr.me.restaurant-partners.com/api/1/deliveries";

export type DispatchVariant = { name: string; body: string };

// Tahminler — en olası önce. (Yanıtta yola çıkınca state = "CLOSED" görüldü.)
const GUESSES: DispatchVariant[] = [
  { name: "state-closed", body: JSON.stringify({ state: "CLOSED" }) },
  { name: "state-dispatched", body: JSON.stringify({ state: "DISPATCHED" }) },
  { name: "state-picked-up", body: JSON.stringify({ state: "PICKED_UP" }) },
];

async function getSetting<T>(key: string): Promise<T | undefined> {
  const doc = await SettingModel.findOne({ key }).lean<{ value?: T }>();
  return doc?.value;
}
async function setSetting(key: string, value: unknown) {
  await SettingModel.updateOne({ key }, { $set: { value } }, { upsert: true });
}

export async function isAutoDispatchEnabled(): Promise<boolean> {
  await connectDB();
  return (await getSetting<boolean>(AUTO_KEY)) !== false;
}
export async function setAutoDispatchEnabled(on: boolean) {
  await connectDB();
  await setSetting(AUTO_KEY, on);
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);

// Kurye "Yola çıktım" dedi → kuyruğa al (kapalıysa sadece kayıt).
export async function queueDispatch(orderId: string): Promise<void> {
  await connectDB();
  const doc = await YemeksepetiOrderModel.findOne({ orderId })
    .select({ liveId: 1, shortCode: 1, liveState: 1, dispatchedAt: 1, dispatchStatus: 1 })
    .lean();
  if (!doc) return;
  const base = { orderId, liveId: doc.liveId ?? undefined, shortCode: doc.shortCode ?? undefined };

  if (doc.dispatchStatus === "sent") return;
  let skip: string | null = null;
  if (!(await isAutoDispatchEnabled())) skip = "Otomatik gönderim kapalı (Ayarlar)";
  else if (!doc.liveId) skip = "Canlı sipariş kimliği yok (oma_…)";
  else if (doc.dispatchedAt || doc.liveState === "CLOSED") skip = "Yemeksepeti'de zaten yola çıkmış";

  if (skip) {
    await YemeksepetiOrderModel.updateOne({ orderId }, { $set: { dispatchStatus: "skipped" } });
    await YemeksepetiDispatchLogModel.create({ kind: "skipped", ...base, note: skip });
    return;
  }
  await YemeksepetiOrderModel.updateOne(
    { orderId },
    {
      $set: { dispatchStatus: "pending", dispatchRequestedAt: new Date(), dispatchAttempts: 0 },
      $unset: { dispatchLeaseAt: "" },
    },
  );
  await YemeksepetiDispatchLogModel.create({ kind: "queued", ...base, note: "Kurye yola çıktı" });
}

// Öğrenilen gerçek içerik: başka siparişe ait kimlikler yenisiyle değiştirilir.
function learnedVariant(
  learned: { body?: string; liveId?: string; orderId?: string } | undefined,
  liveId: string,
  orderId: string,
): DispatchVariant | null {
  if (!learned?.body) return null;
  let body = learned.body;
  if (learned.liveId) body = body.split(learned.liveId).join(liveId);
  if (learned.orderId) body = body.split(learned.orderId).join(orderId);
  return { name: "learned", body };
}

export type DispatchJob = {
  orderId: string;
  liveId: string;
  url: string;
  method: "PUT";
  variants: DispatchVariant[];
};

// Eklenti sorar: gönderilecek iş var mı? Atomik kiralama → iki sekme/bilgisayar
// aynı siparişi iki kez göndermez.
export async function claimDispatchJobs(limit = 3): Promise<DispatchJob[]> {
  await connectDB();
  if (!(await isAutoDispatchEnabled())) return [];
  const now = Date.now();

  // Süresi geçenleri kapat (kayda düşsün, kasada elle basılmalı).
  const expired = await YemeksepetiOrderModel.find({
    dispatchStatus: "pending",
    dispatchRequestedAt: { $lt: new Date(now - MAX_AGE_MS) },
  })
    .select({ orderId: 1, liveId: 1, shortCode: 1 })
    .lean();
  for (const d of expired) {
    await YemeksepetiOrderModel.updateOne({ orderId: d.orderId }, { $set: { dispatchStatus: "failed" } });
    await YemeksepetiDispatchLogModel.create({
      kind: "skipped",
      orderId: d.orderId,
      liveId: d.liveId ?? undefined,
      shortCode: d.shortCode ?? undefined,
      note: "2 saat içinde eklenti almadı (kasada panel kapalı mıydı?)",
    });
  }

  const [preferred, learned] = await Promise.all([
    getSetting<string>(PREFERRED_KEY),
    getSetting<{ body?: string; liveId?: string; orderId?: string }>(LEARNED_KEY),
  ]);

  const jobs: DispatchJob[] = [];
  for (let i = 0; i < limit; i++) {
    const doc = await YemeksepetiOrderModel.findOneAndUpdate(
      {
        dispatchStatus: "pending",
        liveId: { $exists: true },
        dispatchAttempts: { $lt: MAX_ATTEMPTS },
        $or: [
          { dispatchLeaseAt: { $exists: false } },
          { dispatchLeaseAt: { $lt: new Date(now - LEASE_MS) } },
        ],
      },
      { $set: { dispatchLeaseAt: new Date() }, $inc: { dispatchAttempts: 1 } },
      { returnDocument: "after" },
    )
      .select({ orderId: 1, liveId: 1, liveState: 1, dispatchedAt: 1 })
      .lean();
    if (!doc?.liveId) break;

    // Arada kasada elle basılmışsa gönderme.
    if (doc.dispatchedAt || doc.liveState === "CLOSED") {
      await YemeksepetiOrderModel.updateOne({ orderId: doc.orderId }, { $set: { dispatchStatus: "skipped" } });
      await YemeksepetiDispatchLogModel.create({
        kind: "skipped",
        orderId: doc.orderId,
        liveId: doc.liveId,
        note: "Kasada elle yola çıktı denmiş — gönderilmedi",
      });
      continue;
    }

    const variants: DispatchVariant[] = [];
    const lv = learnedVariant(learned, doc.liveId, doc.orderId);
    if (lv) variants.push(lv);
    const guesses = [...GUESSES].sort((a, b) => (a.name === preferred ? -1 : b.name === preferred ? 1 : 0));
    for (const g of guesses) if (!variants.some((v) => v.body === g.body)) variants.push(g);

    jobs.push({
      orderId: doc.orderId,
      liveId: doc.liveId,
      url: `${BASE}/${encodeURIComponent(doc.liveId)}/state`,
      method: "PUT",
      variants,
    });
  }
  return jobs;
}

export type AttemptReport = {
  variant?: string;
  body?: string;
  httpStatus?: number;
  responseState?: string;
  info?: string;
  ok?: boolean;
};

// Eklentinin raporu: denenen içerikler + sonuç.
export async function recordDispatchResult(input: {
  orderId?: string;
  liveId?: string;
  attempts?: AttemptReport[];
  headerNames?: string[];
  error?: string;
}): Promise<void> {
  const orderId = clip(input.orderId, 100);
  if (!orderId) return;
  await connectDB();
  const order = await YemeksepetiOrderModel.findOne({ orderId }).select({ shortCode: 1, liveId: 1 }).lean();
  if (!order) return;
  const attempts = (Array.isArray(input.attempts) ? input.attempts : []).slice(0, 6);
  const headerNames = (Array.isArray(input.headerNames) ? input.headerNames : [])
    .filter((h): h is string => typeof h === "string")
    .slice(0, 20)
    .map((h) => h.slice(0, 60));
  const base = {
    orderId,
    liveId: order.liveId ?? clip(input.liveId, 100),
    shortCode: order.shortCode ?? undefined,
    method: "PUT",
    url: order.liveId ? `${BASE}/${order.liveId}/state` : undefined,
    headerNames,
  };

  if (!attempts.length) {
    await YemeksepetiDispatchLogModel.create({
      kind: "attempt",
      ...base,
      ok: false,
      note: clip(input.error, 500) ?? "Eklenti hiçbir içerik deneyemedi",
    });
  }
  for (const a of attempts) {
    await YemeksepetiDispatchLogModel.create({
      kind: "attempt",
      ...base,
      ok: a.ok === true,
      requestBody: clip(a.body, 2000),
      httpStatus: typeof a.httpStatus === "number" ? a.httpStatus : undefined,
      responseState: clip(a.responseState, 60),
      responseInfo: clip(a.info, 500),
      note: clip(a.variant, 60),
    });
  }

  const win = attempts.find((a) => a.ok === true);
  if (win) {
    await YemeksepetiOrderModel.updateOne(
      { orderId },
      { $set: { dispatchStatus: "sent", dispatchVariant: clip(win.variant, 60) }, $unset: { dispatchLeaseAt: "" } },
    );
    if (win.variant && win.variant !== "learned") await setSetting(PREFERRED_KEY, win.variant);
  } else {
    // Bir tur daha hakkı varsa pending kalır (kiralama süresi dolunca tekrar alınır).
    const doc = await YemeksepetiOrderModel.findOne({ orderId }).select({ dispatchAttempts: 1 }).lean();
    const done = (doc?.dispatchAttempts ?? 0) >= MAX_ATTEMPTS;
    await YemeksepetiOrderModel.updateOne(
      { orderId },
      done ? { $set: { dispatchStatus: "failed" }, $unset: { dispatchLeaseAt: "" } } : { $unset: { dispatchLeaseAt: "" } },
    );
  }
}

// Kasada elle basıldı: panelin gerçekten gönderdiği içerik (anahtarsız).
export async function recordLearnedRequest(input: {
  url?: string;
  method?: string;
  requestBody?: string;
  httpStatus?: number;
  responseState?: string;
  headerNames?: string[];
}): Promise<void> {
  await connectDB();
  const url = clip(input.url, 500)?.split("?")[0];
  const liveId = url?.match(/deliveries\/(oma_[^/]+)/)?.[1];
  const order = liveId
    ? await YemeksepetiOrderModel.findOne({ liveId }).select({ orderId: 1, shortCode: 1 }).lean()
    : null;
  const body = clip(input.requestBody, 2000);
  const state = clip(input.responseState, 60);

  await YemeksepetiDispatchLogModel.create({
    kind: "learned",
    orderId: order?.orderId,
    liveId,
    shortCode: order?.shortCode ?? undefined,
    method: clip(input.method, 10),
    url,
    requestBody: body,
    httpStatus: typeof input.httpStatus === "number" ? input.httpStatus : undefined,
    responseState: state,
    headerNames: (Array.isArray(input.headerNames) ? input.headerNames : [])
      .filter((h): h is string => typeof h === "string")
      .slice(0, 20),
    note:
      state === "CLOSED"
        ? "Kasada elle 'yola çıktı' — gerçek içerik öğrenildi"
        : `Kasada elle durum değişikliği (${state ?? "?"})`,
  });

  // Yalnız gerçek "yola çıktı" (yanıt CLOSED, başarılı) öğrenilir.
  if (state === "CLOSED" && body && (input.httpStatus ?? 0) < 300) {
    await setSetting(LEARNED_KEY, { body, liveId, orderId: order?.orderId, at: new Date() });
  }
}

export type DispatchLogRow = {
  id: string;
  at: string;
  kind: string;
  shortCode?: string;
  orderId?: string;
  ok?: boolean;
  requestBody?: string;
  httpStatus?: number;
  responseState?: string;
  responseInfo?: string;
  headerNames?: string[];
  note?: string;
  url?: string;
  method?: string;
};

export async function listDispatchLogs(limit = 60): Promise<DispatchLogRow[]> {
  await connectDB();
  const rows = await YemeksepetiDispatchLogModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((r) => ({
    id: String(r._id),
    at: (r.createdAt ?? new Date()).toISOString(),
    kind: r.kind,
    shortCode: r.shortCode ?? undefined,
    orderId: r.orderId ?? undefined,
    ok: r.ok ?? undefined,
    requestBody: r.requestBody ?? undefined,
    httpStatus: r.httpStatus ?? undefined,
    responseState: r.responseState ?? undefined,
    responseInfo: r.responseInfo ?? undefined,
    headerNames: r.headerNames ?? undefined,
    note: r.note ?? undefined,
    url: r.url ?? undefined,
    method: r.method ?? undefined,
  }));
}
