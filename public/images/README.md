# Ürün ve Kategori Resimleri

## Konvansiyon

- **Ürün resimleri:** `public/images/products/{slug}.jpg`
  - Slug = ürün adı, küçük harf, Türkçe karakterler sadeleştirilmiş, boşluklar `-` ile.
  - Örnekler:
    - "Adana Kebap" → `adana-kebap.jpg`
    - "Kuşbaşı Kaşarlı Pide" → `kusbasi-kasarli-pide.jpg`
    - "Ali Nazik Kebabı" → `ali-nazik-kebabi.jpg`
- **Kategori resimleri:** `public/images/categories/{category}.jpg` (örn. `kebap.jpg`, `pide.jpg`)

Slug üretim mantığı [src/lib/images.ts](../../src/lib/images.ts) içindeki `productSlug()` fonksiyonundadır. Yeni ürün eklerken aynı kurala uy.

## Önerilen boyutlar

- Ürün: 400×400 (kare) veya 4:3
- Kategori: 200×200 (kare)
- Format: `.jpg` veya `.webp`. Varsayılan beklenen uzantı `.jpg`. `.webp` kullanmak istersen [src/lib/images.ts](../../src/lib/images.ts) içindeki path'i değiştir.

## Fallback

Yerel dosya bulunamazsa render eden component otomatik olarak SVG tile fallback'a düşer (kategori renkleri + ürünün baş harfleri). Network çağrısı yok, 404 görünmez. Bu sayede henüz görsel eklemediğin ürünler de düzgün görünür.
