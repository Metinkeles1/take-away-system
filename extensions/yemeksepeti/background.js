// Arka plan betiği: bridge.js'ten gelen sipariş yakalamalarını sunucuya
// (POST <sunucu>/api/yemeksepeti/ingest) iletir. Sayfa bağlamından değil
// buradan gönderildiği için Yemeksepeti sayfası isteği görmez, CORS gerekmez.

const RELEVANT = /(graphql|deliveries)/i;
const MAX_SENT_KEYS = 500;

// Ayarlar'dan indirilen pakette config.json (sunucu adresi + anahtar) hazır
// gelir. Kurulumda/yenilemede depoya yazılır → kasada elle giriş gerekmez.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const res = await fetch(chrome.runtime.getURL("config.json"));
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg?.serverUrl && cfg?.token) {
      await chrome.storage.local.set({
        serverUrl: String(cfg.serverUrl).replace(/\/+$/, ""),
        token: String(cfg.token),
        lastSync: null,
        sentKeys: [],
      });
    }
  } catch {
    /* config.json yok (elle kurulum) → popup'tan girilir */
  }
});

// Tüm gövdenin kısa özeti — aynı yanıtı tekrar göndermemek için.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const keyOf = (c) => `${String(c.url).split("?")[0]}|${c.body.length}|${hash(c.body)}`;

async function send(captures) {
  const { serverUrl, token, sentKeys = [] } = await chrome.storage.local.get([
    "serverUrl",
    "token",
    "sentKeys",
  ]);
  if (!serverUrl || !token) return;

  // Panel listeyi ~10 sn'de bir yeniler; değişmeyen yanıtı tekrar gönderme.
  const sent = new Set(sentKeys);
  const fresh = [];
  for (const c of captures) {
    if (!RELEVANT.test(String(c.url)) || typeof c.body !== "string") continue;
    const k = keyOf(c);
    if (sent.has(k)) continue;
    sent.add(k);
    fresh.push({ c, k });
  }
  if (!fresh.length) return;

  let lastSync;
  try {
    const res = await fetch(`${serverUrl.replace(/\/+$/, "")}/api/yemeksepeti/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ captures: fresh.map((f) => f.c) }),
    });
    const json = await res.json().catch(() => ({}));
    lastSync = res.ok
      ? { ok: true, at: Date.now(), orders: json.orders ?? 0, raw: json.raw ?? 0 }
      : { ok: false, at: Date.now(), error: json.error || `HTTP ${res.status}` };
  } catch (err) {
    lastSync = { ok: false, at: Date.now(), error: String(err?.message || err) };
  }

  // Sadece başarılı gönderimler "gönderildi" sayılır; hata olursa sonraki
  // yenilemede tekrar denenir.
  const update = { lastSync };
  if (lastSync.ok) {
    update.sentKeys = [...sentKeys, ...fresh.map((f) => f.k)].slice(-MAX_SENT_KEYS);
  }
  await chrome.storage.local.set(update);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "ys-captures" && Array.isArray(msg.captures)) send(msg.captures);
});
