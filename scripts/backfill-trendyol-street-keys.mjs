// Tek seferlik: Trendyol arşivindeki (TrendyolOrder) mevcut kayıtlara sokak
// hafızası anahtarlarını (streetKey / mahalleKey / doorNo) yazar. Yeni senkronlar
// bunu zaten yazıyor (packageToArchive); bu script geçmiş kayıtları hizalar —
// böylece pinli Trendyol siparişleri pinsiz adreslerin tahmininde kullanılır.
// Ayrıştırma uygulamadaki fonksiyonun KENDİSİ (src/lib/customers/streetKey.ts).
//
// GÜVENLİ: varsayılan KURU ÇALIŞMA — sadece raporlar.
// Gerçekten yazmak için:  node scripts/backfill-trendyol-street-keys.mjs --apply

import { readFileSync } from "node:fs";
import dns from "node:dns/promises";
import mongoose from "mongoose";
import { trendyolStreetFields } from "../src/lib/customers/streetKey.ts";

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

async function main() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const coll = mongoose.connection.db.collection("trendyolcustomersnapshots");
  console.log(`\n${APPLY ? "UYGULA" : "KURU ÇALIŞMA"} — Trendyol sokak anahtarları\n`);

  const ops = [];
  let total = 0;
  let parsed = 0;
  let pinned = 0;
  const unparsedSamples = [];

  const cursor = coll.find(
    { anonymizedAt: { $exists: false }, street: { $nin: [null, ""] } },
    { projection: { street: 1, neighborhood: 1, apartmentNumber: 1, lat: 1, streetKey: 1, mahalleKey: 1, doorNo: 1 } },
  );
  for await (const d of cursor) {
    total++;
    const f = trendyolStreetFields(d);
    if (!f.streetKey) {
      if (unparsedSamples.length < 15) unparsedSamples.push(d.street);
      continue;
    }
    parsed++;
    if (Number.isFinite(d.lat)) pinned++;
    if (
      (d.streetKey ?? null) === f.streetKey &&
      (d.mahalleKey ?? null) === f.mahalleKey &&
      (d.doorNo ?? null) === f.doorNo
    ) {
      continue;
    }
    const set = { streetKey: f.streetKey };
    const unset = {};
    if (f.mahalleKey) set.mahalleKey = f.mahalleKey;
    else unset.mahalleKey = "";
    if (f.doorNo) set.doorNo = f.doorNo;
    else unset.doorNo = "";
    ops.push({
      updateOne: {
        filter: { _id: d._id },
        update: Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
      },
    });
  }

  console.log(`Adresli kayıt          : ${total}`);
  console.log(`Sokağı tanınan         : ${parsed} (pinli: ${pinned})`);
  console.log(`Güncellenecek kayıt    : ${ops.length}`);
  if (unparsedSamples.length) {
    console.log("\nTanınmayan örnekler:");
    for (const s of unparsedSamples) console.log(`  · ${s}`);
  }

  if (!APPLY) {
    console.log("\nYazmak için: node scripts/backfill-trendyol-street-keys.mjs --apply\n");
  } else if (ops.length) {
    const r = await coll.bulkWrite(ops, { ordered: false });
    console.log(`\n✓ Güncellendi: ${r.modifiedCount}\n`);
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
