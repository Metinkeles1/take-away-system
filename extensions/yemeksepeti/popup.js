// Biriken yakalamaları gösterir ve dosya olarak indirir. "Gizli" indirmede
// müşteri adı/telefon/adres gibi alanlar maskelenir; alan adları ve yapı
// korunur (aktarımı yazmak için yapı yeterli).

const PII_KEY = /(token|jwt|authorization|password|secret|phone|tel|mobile|gsm|msisdn|email|mail|address|street|building|floor|door|apartment|flat|entrance|postcode|zip|lat|lng|lon|latitude|longitude|instruction|comment|note|surname|lastname|firstname|fullname)/i;
const PERSON_PATH = /(customer|user|client|recipient|consumer|buyer|courier|rider|driver)/i;
const PHONE_LIKE = /\+?\d[\d\s()-]{8,}\d/g;

function mask(value, path = "") {
  if (Array.isArray(value)) return value.map((v, i) => mask(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const p = `${path}.${k}`;
      const hide = PII_KEY.test(k) || (/^name$/i.test(k) && PERSON_PATH.test(path));
      if (hide && (typeof v === "string" || typeof v === "number")) {
        out[k] = typeof v === "number" ? 0 : `«gizli:${v.length}»`;
      } else {
        out[k] = mask(v, p);
      }
    }
    return out;
  }
  if (typeof value === "string") return value.replace(PHONE_LIKE, "«tel»");
  return value;
}

function parse(body) {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

async function load() {
  const { captures = [] } = await chrome.storage.local.get("captures");
  return captures;
}

function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: name, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
}

async function render() {
  const captures = await load();
  document.getElementById("count").textContent = `${captures.length} kayıt`;
  const byUrl = new Map();
  for (const c of captures) {
    const u = `${c.kind.toUpperCase()} ${String(c.url).split("?")[0]}`;
    byUrl.set(u, (byUrl.get(u) || 0) + 1);
  }
  const list = document.getElementById("list");
  list.innerHTML = "";
  for (const [u, n] of [...byUrl.entries()].sort((a, b) => b[1] - a[1])) {
    const li = document.createElement("li");
    li.textContent = `${n}× ${u}`;
    list.appendChild(li);
  }
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

document.getElementById("dlMasked").addEventListener("click", async () => {
  const captures = await load();
  const out = captures.map((c) => ({ ...c, page: c.page?.split("?")[0], body: mask(parse(c.body)) }));
  download(`yemeksepeti-ornek-${stamp()}.json`, out);
});

document.getElementById("dlRaw").addEventListener("click", async () => {
  const captures = await load();
  download(`yemeksepeti-ham-${stamp()}.json`, captures.map((c) => ({ ...c, body: parse(c.body) })));
});

document.getElementById("clear").addEventListener("click", async () => {
  if (!confirm("Biriken tüm kayıtlar silinsin mi?")) return;
  await chrome.storage.local.set({ captures: [] });
  render();
});

async function renderSync() {
  const { serverUrl = "", token = "", lastSync } = await chrome.storage.local.get([
    "serverUrl",
    "token",
    "lastSync",
  ]);
  document.getElementById("serverUrl").value = serverUrl;
  document.getElementById("token").value = token;
  const el = document.getElementById("sync");
  if (!serverUrl || !token) el.textContent = "Bağlantı kurulmadı.";
  else if (!lastSync) el.textContent = "Bağlı. Henüz veri gönderilmedi.";
  else {
    const t = new Date(lastSync.at).toLocaleTimeString("tr-TR");
    el.textContent = lastSync.ok
      ? `✓ Son gönderim ${t} — ${lastSync.orders} sipariş, ${lastSync.raw} canlı kayıt`
      : `✗ Son gönderim ${t} başarısız: ${lastSync.error}`;
    el.style.color = lastSync.ok ? "#15803d" : "#b91c1c";
  }
}

document.getElementById("save").addEventListener("click", async () => {
  const serverUrl = document.getElementById("serverUrl").value.trim().replace(/\/+$/, "");
  const token = document.getElementById("token").value.trim();
  if (serverUrl) {
    let origin;
    try {
      origin = new URL(serverUrl).origin;
    } catch {
      alert("Adres geçersiz. Örnek: https://siteniz.vercel.app");
      return;
    }
    // Sadece bu adrese gönderme izni istenir.
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      alert("İzin verilmedi; veri gönderilemez.");
      return;
    }
  }
  await chrome.storage.local.set({ serverUrl, token, lastSync: null, sentKeys: [] });
  renderSync();
});

render();
renderSync();
