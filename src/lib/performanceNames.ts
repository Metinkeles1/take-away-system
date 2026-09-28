// Performans analizinde isim birleştirme — kendi menü ile Trendyol menüsü aynı
// ürünü farklı yazabiliyor ("Kuşbaşı Kaşarlı Pide" / "Kuşbaşılı Kaşarlı Pide",
// "Ayran 1 Lt" / "Litrelik Ayran", "Kilo Kanat" / "Kilo ile Kanat"). İsimden
// sıralı kelime anahtarı üretilir; aynı anahtar = aynı ürün.
//
// Bilinçli olarak parantez içi SİLİNMEZ: "Kanat (500gr.)" ile "Kanat" farklı
// ürünlerdir (gramaj/porsiyon farkı).

// Kelime bazında eş anlamlılar (küçük harf, Türkçe).
const WORD_ALIASES: Record<string, string> = {
  kuşbaşılı: "kuşbaşı",
  patlıcan: "patlıcanlı",
  litrelik: "1lt",
  menu: "menü",
};

// Anlam taşımayan dolgu kelimeleri.
const STOP_WORDS = new Set(["ile", "ve"]);

export function productKey(name: string): string {
  const s = name
    .toLocaleLowerCase("tr-TR")
    .replace(/çiğ\s+köfte/g, "çiğköfte")
    .replace(/(\d+(?:[.,]\d+)?)\s*(lt|litre|l)\b\.?/g, (_m, n: string) => `${n.replace(",", ".")}lt`)
    .replace(/(\d+)\s*(gr|g)\b\.?/g, "$1gr")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ") // "2.5lt" kalır, "gr." noktası gider
    .replace(/[,'’"&/+()\-]/g, " ");
  const words = s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => WORD_ALIASES[w] ?? w)
    .filter((w) => !STOP_WORDS.has(w));
  return [...new Set(words)].sort().join(" ");
}

// Kurye adı: "metin" / "Metin " / "METİN" aynı kişi.
export function courierKey(name: string): string {
  return name.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

export function titleCaseTr(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/(^|[\s-])(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toLocaleUpperCase("tr-TR"));
}
