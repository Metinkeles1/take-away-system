// Sayfanın kendi bağlamında çalışır (MAIN world). Panelin sunucudan aldığı
// JSON yanıtlarını ve canlı bağlantı (WebSocket) mesajlarını okur, kopyasını
// bridge.js'e iletir. Hiçbir isteği değiştirmez, yeni istek atmaz.
(() => {
  if (window.__ysBridgeHooked) return;
  window.__ysBridgeHooked = true;

  const TAG = "__ys_capture__";
  const MAX_BODY = 300_000; // ~300 KB üstü yanıtları atla (resim/dev listeler)

  function looksJson(text) {
    if (typeof text !== "string") return false;
    const t = text.trimStart();
    return t.startsWith("{") || t.startsWith("[");
  }

  // Sadece sipariş verisi taşıyan servisler. Çeviri, reklam, analiz gürültüsü
  // ve özellikle oturum/giriş uçları (token içerir) ASLA kaydedilmez.
  const ALLOW = /(restaurant-partners\.com|portal\.restaurant)/i;
  const DENY = /(auth|token|login|password|contacts|px-cloud|collector|translations|usercentrics|appcues|perseus|fwf)/i;
  const SECRET_BODY = /"(access_token|refresh_token|device_token|id_token)"/;

  function emit(kind, url, method, status, body) {
    if (!looksJson(body) || body.length > MAX_BODY) return;
    const u = String(url);
    if (!ALLOW.test(u) || DENY.test(u) || SECRET_BODY.test(body)) return;
    try {
      window.postMessage(
        { [TAG]: true, kind, url: String(url), method, status, body, at: Date.now(), page: location.href },
        "*",
      );
    } catch {
      /* yoksay */
    }
  }

  // fetch
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args);
      try {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("json")) {
          const req = args[0];
          const url = typeof req === "string" ? req : req?.url ?? res.url;
          const method = (args[1]?.method || req?.method || "GET").toUpperCase();
          res
            .clone()
            .text()
            .then((t) => emit("fetch", url, method, res.status, t))
            .catch(() => {});
        }
      } catch {
        /* yoksay */
      }
      return res;
    };
  }

  // XMLHttpRequest
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url, ...rest) {
      this.__ys = { method: String(method || "GET").toUpperCase(), url };
      return origOpen.call(this, method, url, ...rest);
    };
    XHR.prototype.send = function (...args) {
      this.addEventListener("load", () => {
        try {
          const ct = this.getResponseHeader("content-type") || "";
          if (!ct.includes("json")) return;
          let body;
          if (this.responseType === "" || this.responseType === "text") body = this.responseText;
          else if (this.responseType === "json") body = JSON.stringify(this.response);
          else return;
          emit("xhr", this.__ys?.url ?? this.responseURL, this.__ys?.method ?? "GET", this.status, body);
        } catch {
          /* yoksay */
        }
      });
      return origSend.apply(this, args);
    };
  }

  // WebSocket — yeni sipariş bildirimleri çoğu panelde buradan gelir.
  const OrigWS = window.WebSocket;
  if (OrigWS) {
    const Wrapped = function (url, protocols) {
      const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
      ws.addEventListener("message", (ev) => {
        if (typeof ev.data !== "string") return;
        // Socket.IO / STOMP gibi protokoller JSON'un önüne önek koyar ("42[...").
        const i = ev.data.search(/[[{]/);
        if (i < 0 || i > 20) return;
        emit("ws", url, "WS", 0, ev.data.slice(i));
      });
      return ws;
    };
    Wrapped.prototype = OrigWS.prototype;
    Object.assign(Wrapped, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    window.WebSocket = Wrapped;
  }
})();
