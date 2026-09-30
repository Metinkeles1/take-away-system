// Müşteri araması için Türkçe harf duyarsız desen: "suleyman sah" yazan da
// "Süleyman Şah"ı bulsun. Hem Mongo sorgusunda hem kartta eşleşen adresi
// seçerken aynı desen kullanılır (sunucu/istemci ortak, bağımlılıksız).
const TR_CLASSES: Record<string, string> = {
  c: "[cçCÇ]",
  g: "[gğGĞ]",
  i: "[iıİI]",
  o: "[oöOÖ]",
  s: "[sşSŞ]",
  u: "[uüUÜ]",
};

const FOLD: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

export function customerSearchPattern(query: string): string {
  let out = "";
  for (const ch of query.trim()) {
    const base = (FOLD[ch] ?? ch).toLowerCase();
    if (TR_CLASSES[base]) out += TR_CLASSES[base];
    else if (/\s/.test(ch)) out += "\\s*";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return out;
}

export function customerSearchRegex(query: string): RegExp {
  return new RegExp(customerSearchPattern(query), "i");
}
