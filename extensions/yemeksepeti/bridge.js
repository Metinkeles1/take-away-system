// Eklentinin kendi bağlamı. hook.js'ten gelen yakalamaları tarayıcının yerel
// deposuna yazar (chrome.storage.local). Dışarıya hiçbir şey göndermez.
(() => {
  const TAG = "__ys_capture__";
  const MAX_ITEMS = 400;

  let queue = [];
  let timer = null;

  function key(c) {
    // Aynı yanıt tekrar tekrar gelirse (panel 10 sn'de bir yeniler) tek tut.
    return `${c.kind}|${c.method}|${String(c.url).split("?")[0]}|${c.body.length}|${c.body.slice(0, 300)}`;
  }

  async function flush() {
    timer = null;
    const batch = queue;
    queue = [];
    if (!batch.length) return;
    // Sunucuya ilet (ayar girilmemişse arka plan betiği sessizce atlar).
    try {
      chrome.runtime.sendMessage({ type: "ys-captures", captures: batch });
    } catch {
      /* eklenti yeniden yüklendiyse bağlantı kopar; sayfa yenilenince düzelir */
    }
    const { captures = [] } = await chrome.storage.local.get("captures");
    const seen = new Set(captures.map(key));
    for (const c of batch) {
      const k = key(c);
      if (seen.has(k)) continue;
      seen.add(k);
      captures.push(c);
    }
    const trimmed = captures.slice(-MAX_ITEMS);
    try {
      await chrome.storage.local.set({ captures: trimmed });
    } catch {
      // Depo doldu → en eski yarıyı at ve tekrar dene.
      await chrome.storage.local.set({ captures: trimmed.slice(-Math.floor(MAX_ITEMS / 2)) });
    }
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d[TAG] !== true) return;
    queue.push({ kind: d.kind, url: d.url, method: d.method, status: d.status, body: d.body, at: d.at, page: d.page });
    if (!timer) timer = setTimeout(flush, 1500);
  });
})();
