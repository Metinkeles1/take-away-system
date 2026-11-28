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

  // ── Otomatik "yola çıktı" (v0.5) ─────────────────────────────────────────
  // Panelin Yemeksepeti sunucusuna eklediği başlıklar (giriş anahtarı dahil)
  // SADECE bu sekmenin hafızasında tutulur — hiçbir yere gönderilmez/yazılmaz.
  // Sunucumuza yalnız başlık ADLARI raporlanır (teşhis için).
  const PARTNER_API = /restaurant-partners\.com/i;
  const SKIP_HEADER = /^(content-type|content-length|accept|accept-language)$/i;
  // Sunucu (host) başına ayrı tutulur: başka bir restaurant-partners alt
  // alanına giden başlık, vendor-api'nin izin listesinde yoksa tarayıcı isteği
  // ("Failed to fetch") keser.
  const headersByHost = {};
  function hostOf(url) {
    try {
      return new URL(String(url), location.href).host;
    } catch {
      return "";
    }
  }
  function rememberHeader(url, name, value) {
    try {
      if (!PARTNER_API.test(String(url)) || !name || SKIP_HEADER.test(name)) return;
      const h = hostOf(url);
      if (!h) return;
      (headersByHost[h] ||= {})[String(name).toLowerCase()] = String(value);
    } catch {
      /* yoksay */
    }
  }
  const headersFor = (url) => headersByHost[hostOf(url)] || {};
  function rememberHeaders(url, headers) {
    if (!headers) return;
    try {
      if (typeof Headers !== "undefined" && headers instanceof Headers) {
        headers.forEach((v, k) => rememberHeader(url, k, v));
      } else if (Array.isArray(headers)) {
        for (const [k, v] of headers) rememberHeader(url, k, v);
      } else if (typeof headers === "object") {
        for (const k of Object.keys(headers)) rememberHeader(url, k, headers[k]);
      }
    } catch {
      /* yoksay */
    }
  }

  // Kasada elle basılan durum değişikliği (…/deliveries/oma_…/state): panelin
  // GÖNDERDİĞİ içerik öğrenilir (başlık değerleri hariç).
  const STATE_URL = /\/api\/1\/deliveries\/oma_[\w-]+\/state(\?|$)/;
  function learn(url, method, reqBody, status, resText) {
    try {
      if (!STATE_URL.test(String(url)) || method === "GET") return;
      let state;
      try {
        state = JSON.parse(resText)?.state;
      } catch {
        /* yoksay */
      }
      window.postMessage(
        {
          __ys_learn__: true,
          url: String(url).split("?")[0],
          method,
          requestBody: typeof reqBody === "string" ? reqBody.slice(0, 2000) : reqBody == null ? "" : "[metin değil]",
          httpStatus: status,
          responseState: typeof state === "string" ? state : undefined,
          headerNames: Object.keys(headersFor(url)),
        },
        "*",
      );
    } catch {
      /* yoksay */
    }
  }

  // Sunucudan gelen iş: tahmini içerikleri sırayla dener, ilk 2xx'te durur.
  let credMode = "same-origin";
  const JOB_URL = /^https:\/\/vendor-api-[a-z]+\.me\.restaurant-partners\.com\/api\/1\/deliveries\/oma_[\w-]+\/state$/;
  async function runJob(job) {
    const attempts = [];
    const panelHeaders = headersFor(job?.url);
    const headerNames = Object.keys(panelHeaders);
    if (!job || !JOB_URL.test(String(job.url)) || job.method !== "PUT" || !Array.isArray(job.variants)) {
      return { orderId: job?.orderId, attempts, headerNames, error: "Geçersiz iş (adres/yöntem)" };
    }
    for (const v of job.variants.slice(0, 5)) {
      if (typeof v?.body !== "string" || v.body.length > 2000) continue;
      const a = { variant: String(v.name ?? ""), body: v.body };
      try {
        // Panel giriş anahtarını başlıkta (authorization) gönderir, çerezle
        // değil. Eskiden credentials:"include" vardı → Yemeksepeti sunucusu
        // çerezli çapraz isteğe izin vermediği için tarayıcı isteği kesiyordu
        // ("Failed to fetch"). Önce panelin yaptığı gibi çerezsiz; ağ hatası
        // olursa bir kez çerezli dene, tutan yöntemi hatırla.
        const send = (credentials) =>
          origFetch(job.url, {
            method: "PUT",
            headers: { ...panelHeaders, "content-type": "application/json" },
            body: v.body,
            credentials,
          });
        let res;
        try {
          res = await send(credMode);
        } catch (e1) {
          const alt = credMode === "include" ? "same-origin" : "include";
          res = await send(alt).catch(() => {
            throw e1;
          });
          credMode = alt;
        }
        a.httpStatus = res.status;
        const text = await res.text().catch(() => "");
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* yoksay */
        }
        a.responseState = typeof json?.state === "string" ? json.state : undefined;
        const dispatched = !!json?.transport?.dispatchedAt;
        a.ok = res.ok && (a.responseState === "CLOSED" || dispatched);
        // Hata yanıtında kısa açıklama (başarılı yanıt müşteri bilgisi içerir → yazılmaz).
        if (!res.ok) {
          const msg = json && (json.message || json.error || json.code || json.errors);
          a.info = (msg ? JSON.stringify(msg) : text).slice(0, 300);
        } else if (!a.ok) {
          a.info = "2xx ama yanıtta yola çıktı görünmüyor";
        }
        attempts.push(a);
        if (res.ok) break; // durum değişti → başka içerik deneme
      } catch (err) {
        a.info = String(err?.message || err).slice(0, 300);
        attempts.push(a);
      }
    }
    return { orderId: job.orderId, liveId: job.liveId, attempts, headerNames };
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__ys_cmd__ !== "dispatch") return;
    const { job, reqId } = ev.data;
    runJob(job).then((result) => window.postMessage({ __ys_result__: true, reqId, result }, "*"));
  });

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
      try {
        const r0 = args[0];
        const u0 = typeof r0 === "string" ? r0 : r0?.url;
        rememberHeaders(u0, args[1]?.headers ?? r0?.headers);
      } catch {
        /* yoksay */
      }
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
            .then((t) => {
              emit("fetch", url, method, res.status, t);
              learn(url, method, args[1]?.body, res.status, t);
            })
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
    const origSetHeader = XHR.prototype.setRequestHeader;
    XHR.prototype.setRequestHeader = function (name, value) {
      rememberHeader(this.__ys?.url, name, value);
      return origSetHeader.call(this, name, value);
    };
    XHR.prototype.open = function (method, url, ...rest) {
      this.__ys = { method: String(method || "GET").toUpperCase(), url };
      return origOpen.call(this, method, url, ...rest);
    };
    XHR.prototype.send = function (...args) {
      const reqBody = args[0];
      this.addEventListener("load", () => {
        try {
          const ct = this.getResponseHeader("content-type") || "";
          if (!ct.includes("json")) return;
          let body;
          if (this.responseType === "" || this.responseType === "text") body = this.responseText;
          else if (this.responseType === "json") body = JSON.stringify(this.response);
          else return;
          emit("xhr", this.__ys?.url ?? this.responseURL, this.__ys?.method ?? "GET", this.status, body);
          learn(this.__ys?.url ?? this.responseURL, this.__ys?.method ?? "GET", reqBody, this.status, body);
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
