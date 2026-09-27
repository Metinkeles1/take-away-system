import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gizlilik Politikası" };

// Google OAuth onay ekranının istediği herkese açık gizlilik politikası.
// Google Kişiler bağlantısının neyi okuyup yazdığını açıklar.
export default function PrivacyPage() {
  return (
    <main className="h-full overflow-y-auto px-4 pt-6 pb-10 md:px-6">
      <article className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold tracking-tight">Gizlilik Politikası</h1>
        <p>
          Bu uygulama, Konak Kebap&apos;ın kendi paket servis siparişlerini ve
          müşteri kayıtlarını yönetmek için kullandığı dahili bir yönetim
          panelidir. Genel kullanıma açık değildir.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Google Kişiler erişimi</h2>
        <p>
          İşletme sahibi kendi Google hesabını bağladığında uygulama, sipariş
          veren müşterilerin adını, telefon numarasını ve teslimat adresini bu
          hesabın Google Kişiler rehberine ekler. Aynı numaranın rehberde zaten
          olup olmadığını anlamak için rehberdeki telefon numaralarını okur.
          Rehberdeki başka hiçbir bilgi okunmaz, değiştirilmez veya silinmez.
        </p>
        <p>
          Google&apos;dan alınan veriler yalnızca bu amaçla kullanılır, üçüncü
          taraflarla paylaşılmaz, satılmaz ve reklam için kullanılmaz. Bağlantı
          uygulamanın Ayarlar sayfasından veya Google hesabının güvenlik
          ayarlarından istenildiği an kaldırılabilir.
        </p>
        <h2 className="pt-2 text-lg font-semibold">İletişim</h2>
        <p>efendiustakonakkebap@gmail.com</p>
      </article>
    </main>
  );
}
