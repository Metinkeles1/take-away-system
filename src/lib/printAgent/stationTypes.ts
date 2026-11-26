// Mutfak istasyonları (Ocakbaşı, Fırın…) — hem sunucu hem Ayarlar kartı kullanır.
// Açıkken her siparişin ürünleri kategorisine göre istasyonlara bölünür ve her
// istasyonun kendi fişi, seçilen bilgisayarın seçilen yazıcısından çıkar
// (kasadaki "Trendyol Yazıcı" programı basar). Kasanın tam fişi aynen devam eder.

export interface PrintStation {
  id: string;
  name: string; // fişin en üstünde yazar: "OCAKBAŞI"
  categories: string[]; // menü kategorisi value'ları (bir kategori yalnız bir istasyonda)
  deviceId: string; // basacak bilgisayar ("" = ayarlanmadı → fiş çıkmaz)
  printerName: string; // o bilgisayardaki yazıcı ("" = bilgisayarın kendi seçtiği)
}

export interface PrintStationConfig {
  enabled: boolean;
  enabledAt: string; // ISO — bu andan önce gelen platform siparişleri bölünmez
  // Menüde bulunamayan platform ürünü (Trendyol/Yemeksepeti adı eşleşmedi) hangi
  // istasyona gitsin? "" = hiçbirine (yalnız kasa fişinde görünür).
  fallbackStationId: string;
  stations: PrintStation[];
}

export const MAX_STATIONS = 6;

export function defaultStationConfig(): PrintStationConfig {
  return {
    enabled: false,
    enabledAt: new Date(0).toISOString(),
    fallbackStationId: "ocak",
    stations: [
      { id: "ocak", name: "Ocakbaşı", categories: ["kebap", "durum"], deviceId: "", printerName: "" },
      { id: "firin", name: "Fırın", categories: ["pide", "lahmacun"], deviceId: "", printerName: "" },
    ],
  };
}
