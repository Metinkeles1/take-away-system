// Minimal service worker — yalnızca PWA kurulabilirliği ve offline açılış için.
// ÖNEMLİ: API/veri isteklerini ASLA cache'lemez (panel canlı veriyle çalışır, bayat
// veri riski olmasın). Sadece sayfa gezinmelerinde network-first + offline yedeği yapar.
const CACHE = "paket-shell-v1";
const OFFLINE_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Sadece sayfa gezinmelerini (HTML navigasyonu) ele al. API, _next, statik dosyalar
  // tarayıcının normal akışına bırakılır → her zaman taze veri.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Başarılı gezinmeyi offline yedeği olarak güncel tut.
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(OFFLINE_URL, copy));
        return response;
      })
      .catch(() => caches.match(OFFLINE_URL))
  );
});
