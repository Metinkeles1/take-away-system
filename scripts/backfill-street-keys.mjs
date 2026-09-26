// Tek seferlik: mevcut müşteri adreslerine sokak hafızası anahtarlarını
// (streetKey / mahalleKey / doorNo) yazar. Yeni/değişen adresler bunu zaten
// kaydederken alıyor (addressesSetFields); bu script geçmiş kayıtları hizalar.
// Ayrıştırma uygulamadaki fonksiyonun KENDİSİ (src/lib/customers/streetKey.ts).
//
// Eski tek-adresli kayıtlar (addresses boş) yalnızca PİNLİYSE adres listesine
// çevrilir — sokak hafızasına referans olabilmeleri için. Dönüşüm uygulamanın
// okurken yaptığıyla aynı (normalizeCustomerAddresses → "addr-legacy").
//
// GÜVENLİ: varsayılan KURU ÇALIŞMA — sadece raporlar.
// Gerçekten yazmak için:  node scripts/backfill-street-keys.mjs --apply

import { readFileSync } from "node:fs";
import dns from "node:dns/promises";
import mongoose from "mongoose";
import { streetFields } from "../src/lib/customers/streetKey.ts";

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

const same = (a, b) =>
  (a.streetKey ?? null) === b.streetKey &&
  (a.mahalleKey ?? null) === b.mahalleKey &&
  (a.doorNo ?? null) === b.doorNo;

async function main() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const customers = mongoose.connection.db.collection("customers");
  console.log(`\n${APPLY ? "UYGULA" : "KURU ÇALIŞMA"} — sokak anahtarları\n`);

  const ops = [];
  let parsed = 0;
  let unparsed = 0;
  let legacy = 0;
  const unparsedSamples = [];

  for await (const c of customers.find({})) {
    const list = Array.isArray(c.addresses) ? c.addresses : [];
    if (list.length > 0) {
      let changed = false;
      const next = list.map((a) => {
        const f = streetFields(a.address ?? "", a.addressDetail);
        if (f.streetKey) parsed++;
        else {
          unparsed++;
          if (unparsedSamples.length < 15) unparsedSamples.push(a.address);
        }
        if (same(a, f)) return a;
        changed = true;
        return { ...a, ...f };
      });
      if (changed) {
        ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: { addresses: next } } } });
      }
      continue;
    }

    // Eski tek-adresli kayıt: yalnızca pinliyse listeye çevir.
    if (c.address && c.geo && Number.isFinite(c.geo.lat)) {
      const f = streetFields(c.address, c.addressDetail);
      if (!f.streetKey) continue;
      legacy++;
      parsed++;
      ops.push({
        updateOne: {
          filter: { _id: c._id },
          update: {
            $set: {
              addresses: [
                {
                  id: "addr-legacy",
                  address: c.address,
                  ...(c.addressDetail ? { addressDetail: c.addressDetail } : {}),
                  geo: c.geo,
                  useCount: c.orderCount ?? 0,
                  lastUsedAt: c.updatedAt ?? new Date(0),
                  ...f,
                },
              ],
            },
          },
        },
      });
    }
  }

  console.log(`Sokağı tanınan adres : ${parsed}`);
  console.log(`Sokağı tanınmayan    : ${unparsed}`);
  console.log(`Listeye çevrilecek eski pinli kayıt: ${legacy}`);
  console.log(`Güncellenecek müşteri: ${ops.length}`);
  if (unparsedSamples.length) {
    console.log("\nTanınmayan örnekler:");
    for (const s of unparsedSamples) console.log(`  · ${s}`);
  }

  if (!APPLY) {
    console.log("\nYazmak için: node scripts/backfill-street-keys.mjs --apply\n");
  } else if (ops.length) {
    const r = await customers.bulkWrite(ops, { ordered: false });
    console.log(`\n✓ Güncellendi: ${r.modifiedCount}\n`);
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
