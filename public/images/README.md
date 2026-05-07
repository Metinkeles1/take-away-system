# Ürün ve Kategori Resimleri

## Konvansiyon

- **Ürün resimleri:** `public/images/products/{id}.jpg` (örn. `k1.jpg`, `p3.jpg`, `i7.jpg`)
- **Kategori resimleri:** `public/images/categories/{category}.jpg` (örn. `kebap.jpg`, `pide.jpg`, `icecek.jpg`)

ID'ler `src/data/menu.ts` içindeki `MENU_ITEMS` listesinden alınır. Kategori değerleri `MENU_CATEGORIES.value` alanından gelir.

## Önerilen boyutlar

- Ürün: 400×400 (kare) veya 4:3
- Kategori: 200×200 (kare)
- Format: `.jpg` veya `.webp` (dosya adında uzantı `.jpg` olarak bekleniyor; webp kullanmak istersen [src/lib/images.ts](../../src/lib/images.ts) içinden uzantıyı değiştir)

## Fallback

Yerel dosya bulunamazsa otomatik olarak `picsum.photos` üzerinden ID-tabanlı (deterministik) rastgele bir görsel yüklenir. Aynı ID her seferinde aynı görseli verir.
