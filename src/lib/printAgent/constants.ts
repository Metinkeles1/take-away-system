// Trendyol Yazıcı — hem sunucu hem Ayarlar kartının kullandığı sabitler.

// Otomatik kabulde Trendyol'a bildirilen hazırlık süresi seçenekleri (dk).
export const PREP_CHOICES = [10, 15, 20, 25, 30, 40, 50, 60] as const;

// Bu kadar süredir ses vermeyen program "çevrimdışı" sayılır.
export const AGENT_ONLINE_MS = 180_000; // program dakikada bir sorar
