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
