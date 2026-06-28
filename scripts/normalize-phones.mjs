// Tek seferlik migration: mevcut TÜM müşteri ve sipariş telefonlarını tek standarda
// (0 + 10 hane, ör. "05551234567") çeker. Uygulama tarafında yeni kayıtlar zaten
// toLocalPhone ile normalize ediliyor; bu script geçmiş kayıtları hizalar.
//
// GÜVENLİ: varsayılan KURU ÇALIŞMA (dry-run) — sadece neyin değişeceğini raporlar.
// Gerçekten yazmak için:  node scripts/normalize-phones.mjs --apply
//
// Not: customers.phone unique DEĞİL (yalnızca id unique), bu yüzden yerinde
// normalize güvenli — çakışma yaratmaz. Pin/açık hesap eşleşmesi zaten rakam
// bazlı olduğundan bu sadece "Ara" düğmesi ve görüntü tutarlılığı içindir.

import { readFileSync } from "node:fs";
import dns from "node:dns/promises";
import mongoose from "mongoose";

// Windows + Node'da Atlas SRV DNS sorunlarına karşı (uygulamadaki connectDB ile aynı).
dns.setServers(["1.1.1.1", "8.8.8.8"]);

// .env.local'dan MONGODB_URI oku (reconstruct-net.mjs ile aynı yöntem).
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

// Uygulamadaki toLocalPhone ile aynı mantık (src/lib/utils.ts).
const phoneKey = (p) => (p || "").replace(/\D/g, "").slice(-10);
const toLocalPhone = (raw) => {
  const k = phoneKey(raw);
  return k.length === 10 ? `0${k}` : (raw || "").replace(/\D/g, "");
};

async function run() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;
  console.log(
    `\n${APPLY ? "🟢 UYGULAMA MODU (yazılacak)" : "🟡 KURU ÇALIŞMA (sadece rapor)"} — DB: ${db.databaseName}\n`,
  );

  // ─── Müşteriler ───────────────────────────────────────────────────────────
  const customers = db.collection("customers");
  const custDocs = await customers
    .find({}, { projection: { _id: 1, phone: 1 } })
    .toArray();
  const custOps = [];
  let custSamples = 0;
  for (const c of custDocs) {
    const next = toLocalPhone(c.phone);
    if (next && next !== c.phone) {
      custOps.push({
        updateOne: { filter: { _id: c._id }, update: { $set: { phone: next } } },
      });
      if (custSamples < 8) {
        console.log(`  müşteri: "${c.phone}"  →  "${next}"`);
        custSamples++;
      }
    }
  }
  console.log(
    `\nMüşteri: ${custDocs.length} kayıt, ${custOps.length} normalize edilecek.\n`,
  );

  // ─── Siparişler ─────────────────────────────────────────────────────────────
  const orders = db.collection("orders");
  const orderDocs = await orders
    .find({}, { projection: { _id: 1, "customer.phone": 1 } })
    .toArray();
  const orderOps = [];
  let orderSamples = 0;
  for (const o of orderDocs) {
    const cur = o.customer?.phone;
    const next = toLocalPhone(cur);
    if (next && next !== cur) {
      orderOps.push({
        updateOne: {
          filter: { _id: o._id },
          update: { $set: { "customer.phone": next } },
        },
      });
      if (orderSamples < 8) {
        console.log(`  sipariş: "${cur}"  →  "${next}"`);
        orderSamples++;
      }
    }
  }
  console.log(
    `\nSipariş: ${orderDocs.length} kayıt, ${orderOps.length} normalize edilecek.\n`,
  );

  if (!APPLY) {
    console.log(
      "Hiçbir şey yazılmadı. Uygulamak için:  node scripts/normalize-phones.mjs --apply\n",
    );
    await mongoose.disconnect();
    return;
  }

  if (custOps.length) {
    const r = await customers.bulkWrite(custOps, { ordered: false });
    console.log(`✓ Müşteri güncellendi: ${r.modifiedCount}`);
  }
  if (orderOps.length) {
    const r = await orders.bulkWrite(orderOps, { ordered: false });
    console.log(`✓ Sipariş güncellendi: ${r.modifiedCount}`);
  }
  console.log("\n✅ Migration tamamlandı.\n");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("✗ Migration hatası:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
