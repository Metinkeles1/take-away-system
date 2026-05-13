# Trendyol GO Yemek Entegrasyonu

Paket servis siparişlerini Trendyol GO'dan tek panelden takip etmek için
webhook tabanlı entegrasyon + outbound REST client.

## Akış

```
Trendyol GO  --POST + Basic/x-api-key + JSON-->  /api/webhooks/trendyol
                                                            |
                                                    mapper + dedupe
                                                            |
                                                        MongoDB
                                                            |
                              /orders sayfası (15sn polling) + /dashboard/trendyol
```

## Trendyol Dashboard

Trendyol siparişleri ana dashboard'dan ayrı, kendi sayfasında izlenir:
**`/dashboard/trendyol`** — sidebar'daki Trendyol linkinden açılır.

İçerik: bugünkü sipariş/ciro (dünle karşılaştırma), aktif sipariş, ortalama
sepet, kabul oranı, saatlik yoğunluk, ödeme dağılımı (bugün + tüm zamanlar),
durum donut'u, 7 günlük trend, en çok satan ürünler ve son siparişler.

Veri tek bir MongoDB `$facet` aggregation pipeline'ı ile tek query'de çekilir
(`src/actions/trendyolDashboard.ts`) — JS tarafında gruplama yapan ana
dashboard'a göre büyük veride çok daha hızlı. Sayfa 30 sn'de bir kendini
yeniler.

## Kurulum (Canlı)

### 1. `.env.local` değerleri

Trendyol partner panelinden aldığın değerleri gir (örnek `.env.example`):

```
TRENDYOL_SUPPLIER_ID=...           # Cari ID
TRENDYOL_INTEGRATION_REF=...       # Entegrasyon Referans Kodu
TRENDYOL_API_KEY=...
TRENDYOL_API_SECRET=...
TRENDYOL_API_TOKEN=...              # base64(API_KEY:API_SECRET) — panelde hazır verilir
TRENDYOL_API_BASE_URL=https://apigw.trendyol.com   # stage: https://stageapigw.trendyol.com
TRENDYOL_WEBHOOK_API_KEY=...       # webhook secret; panelde "Webhook key" alanına yazdığın
```

### 2. Webhook URL'ini Trendyol paneline gir

```
https://<canlı-domainin>/api/webhooks/trendyol
```

Lokal test için public URL gerekir:
```bash
ngrok http 3000
# çıkan https://abc-123.ngrok-free.app URL'sini Trendyol paneline ver
```

### 3. Webhook auth

Kod hem `Authorization: Basic <token>` hem `x-api-key: <key>` başlığını kabul
eder. Trendyol panel ayarında hangisini seçtiysen onu gönder; iki tarafta da
çalışır (`src/lib/integrations/trendyol/verify.ts`).

## Outbound (Trendyol'a geri bildirim)

`src/lib/integrations/trendyol/client.ts` içinde hazır:

```ts
import {
  acceptTrendyolPackage,
  rejectTrendyolPackage,
  updateTrendyolPackageStatus,
} from "@/lib/integrations/trendyol/client";

await acceptTrendyolPackage(packageId);
await updateTrendyolPackageStatus(packageId, "PREPARING");
```

**Uyarı:** Endpoint path'leri (`/integration/order-delivery/...`) Trendyol GO
resmi dokümanı geldiğinde doğrulanmalı. Auth ve transport doğru; sadece URL
şablonları küçük revizyon gerektirebilir.

## Dev test akışı (Trendyol'a bağlanmadan)

`src/app/api/dev/trendyol-sim/route.ts` production'da 404 döner; sadece local
geliştirmede aşağıdaki komutla sahte webhook tetikler:

```bash
curl -X POST http://localhost:3000/api/dev/trendyol-sim
```

Canlıda Trendyol gerçek sipariş gönderdiğinde otomatik akar.

## Dosya yapısı

- `types.ts` — Trendyol payload tipleri (resmi GO doküman onayı bekliyor)
- `mapper.ts` — Trendyol payload → dahili `Order`
- `verify.ts` — `x-api-key` veya `Authorization: Basic` doğrulama (constant-time)
- `client.ts` — Outbound REST client (Basic Auth + supplierId UA)
- `mock.ts` — dev test için sahte payload üretici
- `../app/api/webhooks/trendyol/route.ts` — webhook endpoint (idempotent: aynı `externalRef` gelirse update)
- `../app/api/dev/trendyol-sim/route.ts` — dev simülatör (production'da 404)
- `../app/dashboard/trendyol/page.tsx` — Trendyol-özel dashboard sayfası
- `../actions/trendyolDashboard.ts` — tek $facet pipeline ile veri

## Notlar

- Aynı sipariş tekrar webhook olarak gelirse (`externalRef` çakışırsa) yeni
  kayıt açılmaz, sadece durum güncellenir.
- Trendyol siparişlerinin `payment.method`'u büyük çoğunlukla `online`.
- Yeni gelen siparişin status'u otomatik `pending` olur; restoran kabul/red
  ile değiştirir. Status değişikliklerini Trendyol'a geri bildirmek için
  `client.ts` fonksiyonlarını UI tarafında çağırmak gerekir (henüz wire
  edilmedi).
