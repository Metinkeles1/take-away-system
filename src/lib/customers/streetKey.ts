// Adres metninden "sokak hafızası" anahtarlarını çıkarır — saf fonksiyonlar,
// başka modül import ETMEZ (scripts/backfill-street-keys.mjs de doğrudan
// kullanıyor).
//
//   "Safa Mh. Server Sk. No:40/1"  → { mahalle: "safa", street: "server sokak", doorNo: 40 }
//   "safa mahallesi server sokak 50/2" → aynı sokak, doorNo: 50
//   "Server sk 60"                  → { street: "server sokak", doorNo: 60 } (mahalle yok)
//
// Karşılaştırma Türkçe karakterden bağımsızdır (ş→s, ı→i …) ve kısaltmalar
// açılır (mh/mah → mahallesi, sk/sok → sokak, cd/cad → caddesi …). Sokak tipi
// anahtara dahildir: "Server Sokak" ile "Server Caddesi" farklı yoldur.
// İsimlerde boşluk yok sayılır: "Yunus Emre" = "Yunusemre".

export interface StreetParts {
  mahalle?: string;
  street: string;
  doorNo?: number;
}

const FOLD: Record<string, string> = {
  ş: "s",
  ı: "i",
  ğ: "g",
  ü: "u",
  ö: "o",
  ç: "c",
  â: "a",
  î: "i",
  û: "u",
};

function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/[şığüöçâîû]/g, (ch) => FOLD[ch] ?? ch);
}

const MAHALLE_WORDS = new Set(["mh", "mah", "mahalle", "mahallesi"]);

// Kısaltma → sokak tipinin kanonik adı.
const STREET_TYPES: Record<string, string> = {
  sk: "sokak",
  sok: "sokak",
  sokak: "sokak",
  sokagi: "sokak",
  cd: "caddesi",
  cad: "caddesi",
  cadde: "caddesi",
  caddesi: "caddesi",
  bul: "bulvari",
  blv: "bulvari",
  bulv: "bulvari",
  bulvar: "bulvari",
  bulvari: "bulvari",
};

// Sokak adı en fazla bu kadar kelime geriye bakılarak alınır — mahalle
// yazılmamış adreslerde ("Kadıköy Server sk") başa gelen gürültüyü sınırlar.
const MAX_NAME_WORDS = 3;

// Adres satırında kapı no yoksa detay alanının başındaki numara ("9-11/5",
// "no 12 4", "2") kapı no sayılır — sipariş ekranında numara çoğu zaman
// detaya yazılıyor. 0 ("0/0") numara yok demektir.
function doorFromDetail(detail?: string): number | undefined {
  const m = fold(detail ?? "").trim().match(/^(?:no\s*[:.]?\s*)?(\d+)/);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : undefined;
}

export function parseStreet(
  address: string,
  addressDetail?: string,
): StreetParts | null {
  const text = fold(address)
    // "No:40/1", "Sk.No" gibi yapışık yazımlar ayrılsın; "/" ve "-" kapı
    // numarasının içinde kalır (40/1), virgül sınır olarak token olur.
    .replace(/,/g, " , ")
    .replace(/[.:;()"'\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const tokens = text.split(" ");

  const squash = (words: string[]) => words.join("");

  let segStart = 0;
  let mahalle: string | undefined;
  let street: string | undefined;
  let streetEnd = -1;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === ",") {
      segStart = i + 1;
      continue;
    }
    if (MAHALLE_WORDS.has(t)) {
      const name = squash(tokens.slice(segStart, i));
      if (name) mahalle = name;
      segStart = i + 1;
      continue;
    }
    const type = STREET_TYPES[t];
    if (type) {
      const name = squash(
        tokens
          .slice(Math.max(segStart, i - MAX_NAME_WORDS), i)
          .filter((w) => w !== "no"),
      );
      // Son geçen yol kazanır: "Atatürk Cd. Server Sk." → en özel olan sokak.
      if (name) {
        street = `${name} ${type}`;
        streetEnd = i;
      }
      segStart = i + 1;
    }
  }
  if (!street) return null;

  // "Safa, Kaza Sk, 4/4" — mahalle kelimesi yazılmadan ilk virgülden önce
  // yazılmışsa: ilk parça yol/numara içermiyorsa mahalle kabul edilir.
  if (!mahalle) {
    const firstComma = tokens.indexOf(",");
    if (firstComma > 0 && firstComma < streetEnd) {
      const first = tokens.slice(0, firstComma);
      if (first.every((w) => !STREET_TYPES[w] && !/\d/.test(w))) {
        mahalle = squash(first);
      }
    }
  }

  // Kapı no: sokaktan sonraki ilk "no X" ya da rakamla başlayan kelime.
  let doorNo: number | undefined;
  for (let i = streetEnd + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === ",") continue;
    const candidate = t === "no" ? tokens[i + 1] : t.replace(/^no(?=\d)/, "");
    const m = candidate?.match(/^(\d+)/);
    if (m) {
      doorNo = Number(m[1]);
      break;
    }
    // "kat", "daire" vb. gelmeden numara çıkmadıysa kapı no yok say.
    if (t !== "no") break;
  }

  return { mahalle, street, doorNo: doorNo || doorFromDetail(addressDetail) };
}

// Veritabanına yazılan alanlar (adres alt-dokümanı). Sokak çıkmazsa hepsi null
// — eski/yanlış anahtar kalmasın.
export function streetFields(
  address: string,
  addressDetail?: string,
): {
  streetKey: string | null;
  mahalleKey: string | null;
  doorNo: number | null;
} {
  const p = parseStreet(address, addressDetail);
  return {
    streetKey: p?.street ?? null,
    mahalleKey: p?.mahalle ?? null,
    doorNo: p?.doorNo ?? null,
  };
}

// Trendyol arşiv kaydı için aynı anahtarlar. Trendyol mahalleyi ayrı alanda
// (neighborhood), bina numarasını apartmentNumber'da verir; address1 çoğu zaman
// mahalleyi yazmaz → mahalle neighborhood'dan, kapı no yoksa bina no'dan alınır.
// (doorNumber Trendyol'da DAİRE no'dur, kapı no değil.)
// address1 sık sık mahalle adını virgülsüz başa yazar ("Mevlana Burç Sk.") —
// olduğu gibi ayrıştırılırsa sokak "mevlanaburc sokak" çıkar; baştaki mahalle
// adı atılır (atınca sokak kalmıyorsa — "Mevlana Cd." — atılmaz).
export function trendyolStreetFields(a: {
  street?: string;
  neighborhood?: string;
  apartmentNumber?: string;
}): ReturnType<typeof streetFields> {
  const street = a.street ?? "";
  const hood = fold(a.neighborhood ?? "")
    .split(/\s+/)
    .filter((w) => w && !MAHALLE_WORDS.has(w.replace(/\.$/, "")))
    .join(" ");
  let f = streetFields(street, a.apartmentNumber);
  if (hood) {
    const words = street.trim().split(/\s+/);
    const n = hood.split(" ").length;
    if (fold(words.slice(0, n).join(" ")) === hood && !/,$/.test(words[n - 1] ?? "")) {
      const rest = streetFields(words.slice(n).join(" "), a.apartmentNumber);
      if (rest.streetKey) f = rest;
    }
  }
  if (!f.streetKey || f.mahalleKey) return f;
  const m = parseStreet(`${a.neighborhood ?? ""} mahallesi x sokak`);
  return { ...f, mahalleKey: m?.mahalle ?? null };
}
