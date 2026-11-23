# Yemeksepeti Köprüsü (Chrome eklentisi)

Kasadaki bilgisayarda Yemeksepeti partner paneli açıkken, panelin ekrana getirdiği
sipariş verisini işletmenin kendi sistemine aktarır. Şifre saklamaz.

**Tek yazma işi (v0.5):** kurye sistemde "Yola çıktım" deyince, panelin kendi
oturumuyla Yemeksepeti'ye "yola çıktı" bildirir (panelin butonunun yaptığı istek).
Giriş anahtarı sadece sekmenin hafızasında kalır, hiçbir yere gönderilmez.
Ayarlar → Yemeksepeti Köprüsü'nden kapatılabilir; denemeler orada kayıtlıdır.
Kasada elle "yola çıktı"ya basıldığında panelin gönderdiği içerik öğrenilir.

## Gerekenler
- Kasada Google Chrome (veya Edge).
- Sistemin canlı adresi (ör. `https://siteniz.vercel.app`).
- Bağlantı anahtarı: sunucudaki `YEMEKSEPETI_INGEST_TOKEN` değeri (geliştiriciden alın).

## Kurulum (bir kere)
1. Bu klasörü (`yemeksepeti`) kasa bilgisayarında **kalıcı** bir yere kopyalayın,
   ör. `C:\YemeksepetiKopru`. Chrome eklentiyi buradan çalıştırır; klasör silinir
   veya taşınırsa eklenti durur.
2. Chrome'da adres çubuğuna `chrome://extensions` yazın.
3. Sağ üstten **Geliştirici modu**nu açın.
4. **Paketlenmemiş öğe yükle** → 1. adımdaki klasörü seçin.
5. Araç çubuğundaki yapboz simgesinden eklentiyi **sabitleyin** (iğne).
6. Eklenti simgesine tıklayın → **Sistem bağlantısı**:
   - Adres: sistemin canlı adresi
   - Anahtar: bağlantı anahtarı
   - **Kaydet** → çıkan izin penceresinde **İzin ver**.
7. Yemeksepeti panelini açıp giriş yapın ve sayfayı **yenileyin (F5)**.
   Eklenti sadece sayfa açılırken devreye girer.

## Çalıştığını kontrol etme
Eklenti simgesine tıklayın:
- `✓ Son gönderim 14:32 — 0 sipariş, 1 canlı kayıt` → çalışıyor.
- `Bağlı. Henüz veri gönderilmedi.` → panelde henüz sipariş/hareket yok; bir sipariş
  gelmesini bekleyin veya "Siparişler / geçmiş" sayfasını açın.
- `✗ ... başarısız: yetkisiz` → anahtar yanlış.
- `✗ ... başarısız: HTTP 404` → adres yanlış veya sistem henüz güncellenmemiş.
- `✗ ... Failed to fetch` → internet yok veya adres hatalı.

## Günlük kullanım
- Chrome ve Yemeksepeti paneli sekmesi **açık kalmalı** (pencere küçültülebilir).
- Bilgisayar **uyku moduna geçmemeli** (Windows → Güç ayarları → Uyku: Hiçbir zaman).
- Chrome açılışta "Geliştirici modu uzantılarını devre dışı bırak" uyarısı gösterebilir:
  **kapat / yoksay** deyin, "devre dışı bırak"a basmayın.

## Güncelleme
Eklentide değişiklik olursa yeni klasörü eskisinin üzerine kopyalayın, sonra
`chrome://extensions` → eklentinin kartında **yenile** (↻) ve Yemeksepeti panelinde F5.
Okuma mantığı sunucuda olduğu için bu nadiren gerekir.

## Popup'taki diğer düğmeler
- **Örneği indir (kişisel bilgiler gizli)**: geliştiriciye hata/inceleme için verilebilir.
- **Ham indir**: müşteri bilgisi içerir, kimseyle paylaşmayın.
- **Temizle**: bu bilgisayarda biriken kayıtları siler (sistemdekileri silmez).
