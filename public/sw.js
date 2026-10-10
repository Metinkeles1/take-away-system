// Minimal service worker — yalnızca PWA kurulabilirliği için.
//
// ÖNEMLİ: Gezinmelere (navigation) ARTIK karışmıyor. Eski sürüm, gezinme isteği
// herhangi bir sebeple (ör. hızlı tıklamada önceki istek iptal edilince)
// başarısız olduğunda önbellekteki "/" shell'ini servis ediyordu — bu da
// kullanıcıyı yanlış/önceki sayfaya atıyordu. Panel canlı veriyle çalıştığından
// offline shell'in değeri düşük; doğruluk önde. Bu yüzden fetch handler hiçbir
// isteğe respondWith yapmaz (tarayıcının normal akışı). Boş fetch listener'ı
// Chrome'un "Uygulamayı yükle" için aradığı tek koşulu karşılar.
const CACHE_PREFIX = "paket-shell";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Eski sürümlerin bıraktığı tüm önbellekleri temizle (bayat sayfa servis
  // eden v1 cache'i dahil) ve kontrolü hemen devral.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Kurulabilirlik için gerekli ama bilinçli olarak hiçbir şeye karışmaz.
self.addEventListener("fetch", () => {});

// ─── Kurye çağır (Web Push) ─────────────────────────────────────────────────
// Panel "Kurye Çağır" deyince sunucu buraya bildirim yollar. Ekran kilitli /
// uygulama kapalı olsa da sistem bildirimi çıkar, telefon titrer. Açık kurye
// ekranlarına da mesaj geçilir: ekran açıksa büyük uyarı + titreşim gösterir.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "🛵 Kurye çağrısı";
  const body = data.body || "Paketler hazır, mutfağa gel";
  const url = data.url || "/kurye";

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: "/icons/kurye-192.png",
        badge: "/icons/kurye-192.png",
        tag: "kurye-cagir",
        renotify: true, // aynı tag'li yeni çağrı da tekrar titretsin/ses çıkarsın
        requireInteraction: true, // kurye dokunana kadar ekranda kalsın
        vibrate: [400, 150, 400, 150, 800],
        data: { url },
      }),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((list) =>
          list.forEach((c) => c.postMessage({ type: "courier-call", title, body, at: data.at || Date.now() })),
        ),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/kurye";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname.startsWith("/kurye"));
      if (open) return open.focus();
      return self.clients.openWindow(url);
    }),
  );
});
