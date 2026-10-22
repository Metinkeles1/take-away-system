// Tek seferlik migration: aynı numaraya (son 10 hane) açılmış birden fazla
// müşteri kaydını TEK kayıtta birleştirir, sonra customers.phone'a UNIQUE
// index koyar — bundan sonra aynı numaraya ikinci kayıt veritabanı seviyesinde
// açılamaz.
//
// Çift kayıtların kaynağı: telefon standardı (0 + 10 hane) gelmeden önce aynı
// numara "0553…" ve "553…" biçimleriyle iki ayrı kayıt açmış; normalize-phones
// numaraları hizaladı ama kayıtları birleştirmedi. Bir de müşteriler sekmesinden
// numarası başka müşterinin numarasına çevrilmiş kayıtlar.
//
// Birleştirme kuralları:
//   - Kalan kayıt: kanonik id'li olan (cust-0XXXXXXXXXX), yoksa en çok siparişli.
//   - İsim: gerçek isim (numara değil) olan tercih edilir.
//   - Adresler birleşir; aynı adres (addressKey) tek adrese iner — kullanım
//     sayısı toplanır, pin olan korunur. Silinen adres id'sine bağlı siparişler
//     kalan adrese yönlendirilir (sipariş geçmişi/pin bağı kopmasın).
//   - Sipariş sayısı toplanır.
//   - Kalan kayıt Google Kişiler'e "gönderilmedi" işaretlenir: birleşik isim/
//     adresler sonraki senkronda rehbere yazılır (aynı numaralı kopyaların
//     hepsi aynı bilgiyle yazılır → Google "Birleştir ve düzelt" tek tık).
//
// GÜVENLİ: varsayılan KURU ÇALIŞMA — sadece rapor. Yazmak için:
//   node scripts/merge-duplicate-customers.mjs --apply
// --apply önce değişecek tüm kayıtları backups/ altına JSON olarak yedekler.
//
// SIRA ÖNEMLİ: Customer şeması phone'u unique bekler; bu script çalışmadan
// o şema yayına çıkarsa Mongoose index'i kuramaz. Önce bu script, sonra deploy.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Uygulamadaki yardımcıların kopyası (src/lib/utils.ts, lib/customers/addresses.ts)
export const phoneKey = (p) => (p || "").replace(/\D/g, "").slice(-10);
export const toLocalPhone = (raw) => {
  const k = phoneKey(raw);
  return k.length === 10 ? `0${k}` : (raw || "").replace(/\D/g, "");
};
const norm = (s) =>
  (s ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[-.,;:/\\_'"()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export const addressKey = (address, addressDetail) =>
  `${norm(address)}|${norm(addressDetail)}`;
const LEGACY_ADDRESS_ID = "addr-legacy";

// İsim alanına numara yazılmış mı (sipariş ekranı ismi telefonla doldurur).
const isPhoneLike = (name) => (name || "").replace(/\D/g, "").length >= 7;

// Eski tek-adresli kayıtlar: addresses boşsa üst seviyeden tek adres türet.
function addressesOf(doc) {
  const list = (doc.addresses ?? []).filter((a) => a?.id && a?.address);
  if (list.length > 0) return list.map((a) => ({ ...a }));
  if (!doc.address) return [];
  return [
    {
      id: LEGACY_ADDRESS_ID,
      address: doc.address,
      addressDetail: doc.addressDetail || undefined,
      geo: doc.geo ?? undefined,
      useCount: doc.orderCount ?? 0,
      lastUsedAt: doc.updatedAt ?? new Date(0),
    },
  ];
}

const time = (d) => (d ? +new Date(d) : 0);

// Saf fonksiyon: müşteri kayıtlarından birleştirme planı çıkarır (DB'ye dokunmaz).
// Dönen her grup: { key, keep, remove[], set, addressRemaps[] }
//   addressRemaps: { fromId, toId, addressKey } — telefonu bu numara olan,
//   addressId=fromId ve adres metni addressKey'e uyan siparişler toId'ye taşınır.
export function planMerge(docs) {
  const groups = new Map();
  for (const d of docs) {
    const k = phoneKey(d.phone);
    if (k.length < 7) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }

  const plans = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const phone = toLocalPhone(list[0].phone);
    const canonicalId = `cust-${phone}`;
    const sorted = [...list].sort(
      (a, b) =>
        (b.id === canonicalId) - (a.id === canonicalId) ||
        (b.orderCount ?? 0) - (a.orderCount ?? 0) ||
        time(a.createdAt) - time(b.createdAt),
    );
    const [keep, ...remove] = sorted;

    const named = sorted.find((d) => d.name && !isPhoneLike(d.name));
    const name = named?.name ?? keep.name ?? phone;

    const merged = [];
    const usedIds = new Set();
    const addressRemaps = [];
    for (const doc of sorted) {
      const isKeep = doc === keep;
      for (const a of addressesOf(doc)) {
        const ak = addressKey(a.address, a.addressDetail);
        const same = merged.find((m) => addressKey(m.address, m.addressDetail) === ak);
        if (same) {
          same.useCount = (same.useCount ?? 0) + (a.useCount ?? 0);
          if (time(a.lastUsedAt) > time(same.lastUsedAt)) same.lastUsedAt = a.lastUsedAt;
          same.geo ??= a.geo;
          same.district ??= a.district;
          if (!isKeep && a.id !== same.id)
            addressRemaps.push({ fromId: a.id, toId: same.id, addressKey: ak });
          continue;
        }
        let id = a.id;
        if (usedIds.has(id)) {
          // Farklı kayıtlarda aynı id (çoğunlukla addr-legacy) farklı adresi
          // gösteriyor → çakışmasın diye yeni id.
          id = `addr-${randomUUID()}`;
          addressRemaps.push({ fromId: a.id, toId: id, addressKey: ak });
        }
        usedIds.add(id);
        merged.push({ ...a, id });
      }
    }

    const defaultAddressId = merged.some((a) => a.id === keep.defaultAddressId)
      ? keep.defaultAddressId
      : null;
    const def =
      merged.find((a) => a.id === defaultAddressId) ??
      [...merged].sort((a, b) => time(b.lastUsedAt) - time(a.lastUsedAt))[0];

    plans.push({
      key,
      keep,
      remove,
      addressRemaps,
      set: {
        name,
        phone,
        orderCount: sorted.reduce((s, d) => s + (d.orderCount ?? 0), 0),
        addresses: merged,
        defaultAddressId,
        address: def?.address ?? keep.address ?? "",
        addressDetail: def?.addressDetail ?? null,
        geo: def?.geo ?? null,
        createdAt: new Date(Math.min(...sorted.map((d) => time(d.createdAt) || Date.now()))),
      },
    });
  }
  return plans;
}

// Siparişteki telefonla eşleşen regex (lib/customers/geoByPhone.ts → phoneMatchRegex).
const phoneRegex = (k) => new RegExp(k.split("").join("\\D*") + "(?:\\D|$)");

async function run() {
  const dns = (await import("node:dns/promises")).default;
  const mongoose = (await import("mongoose")).default;
  // Windows + Node'da Atlas SRV DNS sorunlarına karşı (connectDB ile aynı).
  dns.setServers(["1.1.1.1", "8.8.8.8"]);

  const env = {};
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local yoksa process.env'e düş.
  }
  const MONGODB_URI = env.MONGODB_URI ?? process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("✗ MONGODB_URI bulunamadı (.env.local veya ortam değişkeni).");
    process.exit(1);
  }
  const APPLY = process.argv.includes("--apply");

  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;
  console.log(
    `\n${APPLY ? "🟢 UYGULAMA MODU (yazılacak)" : "🟡 KURU ÇALIŞMA (sadece rapor)"} — DB: ${db.databaseName}\n`,
  );

  const customers = db.collection("customers");
  const orders = db.collection("orders");
  const docs = await customers.find({}).toArray();
  const plans = planMerge(docs);

  // Taşınacak siparişleri bul (adres id'si silinen/yeniden adlanan adrese bağlı).
  const orderOps = [];
  const touchedOrders = [];
  for (const p of plans) {
    if (p.addressRemaps.length === 0) continue;
    const found = await orders
      .find({
        "customer.phone": phoneRegex(p.key),
        "customer.addressId": { $in: p.addressRemaps.map((r) => r.fromId) },
      })
      .toArray();
    for (const o of found) {
      const ak = addressKey(o.customer.address, o.customer.addressDetail);
      const r = p.addressRemaps.find(
        (x) => x.fromId === o.customer.addressId && x.addressKey === ak,
      );
      if (!r) continue;
      touchedOrders.push(o);
      orderOps.push({
        updateOne: {
          filter: { _id: o._id },
          update: { $set: { "customer.addressId": r.toId } },
        },
      });
    }
  }

  for (const p of plans) {
    console.log(
      `• ${p.set.phone}  "${p.set.name}"  ← ${[p.keep, ...p.remove].map((d) => `${d.id}(${d.orderCount ?? 0} sip.)`).join(" + ")}  → ${p.set.addresses.length} adres, ${p.set.orderCount} sipariş`,
    );
  }
  const removeCount = plans.reduce((s, p) => s + p.remove.length, 0);
  console.log(
    `\nToplam ${docs.length} müşteri · ${plans.length} numarada çift kayıt · ${removeCount} kayıt birleşip silinecek · ${orderOps.length} siparişin adres bağı taşınacak.`,
  );

  const phoneIndex = (await customers.indexes()).find(
    (i) => JSON.stringify(i.key) === JSON.stringify({ phone: 1 }),
  );
  console.log(
    `phone index: ${phoneIndex ? `${phoneIndex.name}${phoneIndex.unique ? " (unique ✓)" : " (unique DEĞİL)"}` : "yok"}`,
  );

  if (!APPLY) {
    console.log("\nYazmak için:  node scripts/merge-duplicate-customers.mjs --apply\n");
    await mongoose.disconnect();
    return;
  }

  // Yedek: dokunulacak tüm müşteri kayıtları + siparişler (geri dönüş için).
  if (plans.length > 0 || orderOps.length > 0) {
    const dir = fileURLToPath(new URL("../backups/", import.meta.url));
    mkdirSync(dir, { recursive: true });
    const file = `${dir}customers-merge-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(
      file,
      JSON.stringify(
        {
          customers: plans.flatMap((p) => [p.keep, ...p.remove]),
          orders: touchedOrders,
        },
        null,
        2,
      ),
    );
    console.log(`\nYedek: ${file}`);
  }

  for (const p of plans) {
    await customers.updateOne(
      { _id: p.keep._id },
      { $set: p.set, $unset: { contactExportedAt: 1, contactPreviousPhone: 1 } },
    );
    await customers.deleteMany({ _id: { $in: p.remove.map((d) => d._id) } });
  }
  if (orderOps.length) await orders.bulkWrite(orderOps, { ordered: false });
  console.log(`✓ ${plans.length} numara birleştirildi, ${orderOps.length} sipariş taşındı.`);

  // Unique index: aynı ad/anahtarla unique olmayan varsa önce kaldır.
  if (phoneIndex && !phoneIndex.unique) await customers.dropIndex(phoneIndex.name);
  if (!phoneIndex?.unique) {
    await customers.createIndex({ phone: 1 }, { unique: true, name: "phone_1" });
    console.log("✓ customers.phone unique index kuruldu.");
  }

  await mongoose.disconnect();
  console.log("");
}

// Test dosyası planMerge'i içe aktarınca DB'ye bağlanmasın.
const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) {
  run().catch((err) => {
    console.error("✗ Hata:", err);
    process.exit(1);
  });
}
