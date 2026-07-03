// Trendyol GO Yemek — STAGE test siparişi oluşturucu.
//
// Ne yapar:
//   1) .env.local'ı okur (SUPPLIER_ID, API_KEY/SECRET, STORE_ID).
//   2) Menü servisinden geçerli bir ürün (productId/productName) seçer.
//   3) STAGE test-sipariş endpoint'ine POST atar (kupon/promosyon BOŞ → 400 önlenir).
//   4) Dönen orderNumber'ı yazar. --verify ile paket listesinde görünüyor mu bakar.
//
// GÜVENLİK: Varsayılan STAGE'e gider. Gerçekten sipariş OLUŞTURMAK için `--yes`
// şart; bayrak yoksa yalnızca gönderilecek gövdeyi gösterir (dry-run).
//
// Kullanım (PowerShell):
//   node scripts/trendyol-test-order.mjs                # dry-run (POST atmaz)
//   node scripts/trendyol-test-order.mjs --yes          # gerçekten oluştur
//   node scripts/trendyol-test-order.mjs --yes --verify # oluştur + listede doğrula
//   node scripts/trendyol-test-order.mjs --store 12345 --delivery STORE --yes
//
// Env (öncelik sırası): CLI env > .env.local. Stage kimliği prod'dan farklıysa
// TRENDYOL_STAGE_API_KEY / TRENDYOL_STAGE_API_SECRET tanımla; yoksa prod key denenir.
// Stage base URL: TRENDYOL_TEST_BASE_URL (varsayılan https://stageapi.tgoapis.com).

import { readFileSync } from "node:fs";

// ─── .env.local basit yükleyici (mevcut process.env'i ezmez) ───────────────
function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

// ─── CLI argümanları ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DO_IT = has("--yes");
const VERIFY = has("--verify");
const deliveryType = (val("--delivery", "STORE") || "STORE").toUpperCase();

// ─── Konfig ──────────────────────────────────────────────────────────────
const baseUrl = (
  process.env.TRENDYOL_TEST_BASE_URL ?? "https://stageapi.tgoapis.com"
).replace(/\/$/, "");
const supplierId = process.env.TRENDYOL_SUPPLIER_ID;
const apiKey =
  process.env.TRENDYOL_STAGE_API_KEY ?? process.env.TRENDYOL_API_KEY;
const apiSecret =
  process.env.TRENDYOL_STAGE_API_SECRET ?? process.env.TRENDYOL_API_SECRET;
const storeId = val("--store", process.env.TRENDYOL_STORE_ID);
const agentName = process.env.TRENDYOL_AGENT_NAME ?? "PaketSiparis";
const executorUser = process.env.TRENDYOL_EXECUTOR_USER ?? "system@local";

function die(msg) {
  console.error("\n✖ " + msg + "\n");
  process.exit(1);
}

if (!supplierId) die("TRENDYOL_SUPPLIER_ID eksik (.env.local).");
if (!apiKey || !apiSecret)
  die("TRENDYOL_API_KEY / TRENDYOL_API_SECRET eksik (stage için _STAGE_ önekli de olur).");
if (!storeId)
  die(
    "storeId gerekli. `--store <id>` ver ya da TRENDYOL_STORE_ID env tanımla.\n" +
      "  (Restoran paneli > Mağaza ID)",
  );

const token = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

function toAscii(v) {
  return v
    .replace(/[şŞ]/g, "s").replace(/[ıİ]/g, "i").replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
    .replace(/[^\x20-\x7E]/g, "?");
}

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${token}`,
      "User-Agent": `${supplierId} - SelfIntegration`,
      "x-agentname": toAscii(agentName),
      "x-executor-user": executorUser,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

// ─── 1) Menüden ürün seç ───────────────────────────────────────────────────
async function pickProduct() {
  const path = `/integrator/product/meal/suppliers/${supplierId}/stores/${storeId}/products`;
  const r = await api("GET", path);
  if (!r.ok) die(`Menü alınamadı (${r.status}): ${JSON.stringify(r.data)}`);
  const products = r.data?.products ?? [];
  if (products.length === 0) die("Menüde ürün yok — bu store'da ürün tanımlı değil.");
  const active =
    products.find((p) => (p.status ?? "").toUpperCase() === "ACTIVE") ??
    products[0];
  const name = active.name ?? active.productName ?? "Test Ürün";
  const price =
    active.sellingPrice ?? active.originalPrice ??
    (typeof active.price === "number" ? active.price : 0);
  return { productId: active.id, productName: name, price };
}

// ─── 2) Test siparişi gövdesi ──────────────────────────────────────────────
function buildBody(product) {
  return {
    address: {
      addressDescription: "Kapıdan ara, 2. kat",
      addressText: "Caferağa Mah. Test Sok. No: 5",
      city: "İstanbul",
      district: "Kadıköy",
      neighborhood: "Caferağa",
      latitude: 40.8796,
      longitude: 29.258,
      phone: "5351231231", // 10 haneli
      email: "test@local",
    },
    isStorePickupSelected: false,
    customer: {
      customerFirstName: "Test",
      customerLastName: "Kurye",
      note: "Otomatik test siparişi",
    },
    lines: [
      {
        ingredientOptions: { exclude: [], include: [] },
        modifierProducts: [],
        product: {
          productId: product.productId,
          productName: product.productName,
        },
        quantity: 1,
      },
    ],
    store: { deliveryType, storeId: Number(storeId), supplierId: Number(supplierId) },
    // Kupon/promosyon yok → BOŞ (dolu gönderilirse 400).
    promotions: [],
    payment: {
      isPaidWithMealCard: false,
      mealCardType: "",
      isCashOnDeliveryPaid: true,
      onDeliveryPaymentType: "CASH",
    },
  };
}

// ─── Çalıştır ──────────────────────────────────────────────────────────────
(async () => {
  console.log("Ortam:");
  console.log("  base URL   :", baseUrl);
  console.log("  supplierId :", supplierId);
  console.log("  storeId    :", storeId);
  console.log("  deliveryType:", deliveryType);
  if (!baseUrl.includes("stage")) {
    console.log(
      "\n⚠  base URL 'stage' içermiyor — test-sipariş endpoint'i yalnızca STAGE'de çalışır.",
    );
  }

  const product = await pickProduct();
  console.log("\nSeçilen ürün:", product.productName, `(id ${product.productId})`);

  const body = buildBody(product);

  if (!DO_IT) {
    console.log("\n[DRY-RUN] --yes verilmedi, POST atılmadı. Gönderilecek gövde:\n");
    console.log(JSON.stringify(body, null, 2));
    console.log("\nGerçekten oluşturmak için: node scripts/trendyol-test-order.mjs --yes");
    return;
  }

  console.log("\nTest siparişi oluşturuluyor…");
  const r = await api("POST", "/integrator/meal-test-order/orders/meal", body);
  if (!r.ok) die(`Test siparişi başarısız (${r.status}): ${JSON.stringify(r.data)}`);
  const orderNumber = r.data?.orderNumber ?? "(yanıt içinde yok)";
  console.log("\n✓ Sipariş oluşturuldu. orderNumber:", orderNumber);
  console.log("  Yanıt:", JSON.stringify(r.data));

  if (VERIFY) {
    console.log("\nPaket listesinde doğrulanıyor (Created,Picking,Invoiced)…");
    const q = new URLSearchParams({ packageStatuses: "Created,Picking,Invoiced", size: "50" });
    const lp = await api(
      "GET",
      `/integrator/order/meal/suppliers/${supplierId}/packages?${q}`,
    );
    if (!lp.ok) {
      console.log(`  Liste alınamadı (${lp.status}): ${JSON.stringify(lp.data)}`);
      return;
    }
    const match = (lp.data?.content ?? []).find(
      (p) => String(p.orderNumber) === String(orderNumber),
    );
    console.log(
      match
        ? `  ✓ Listede bulundu: packageId ${match.id}, statü ${match.packageStatus}, tip ${match.deliveryType}`
        : "  ⚠ Henüz listede görünmüyor (webhook/işlenme gecikmesi olabilir, biraz sonra tekrar dene).",
    );
  }
})().catch((e) => die(e?.message ?? String(e)));
