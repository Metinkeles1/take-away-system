// Trendyol paket adresini tek biçime getirir. Trendyol (Ekim 2026'dan beri)
// bina/kat/daire alanlarına "TGO Yemek" yazıyor, gerçek değerleri adres
// satırının sonuna "Apt: 10A, Kat: 9, Daire: 39" diye ekliyor. Bu da kurye
// kartında "Bina TGO Yemek · Kat TGO Yemek" ve adresin iki kez yazılması
// demekti. Burada:
//  - "TGO Yemek" gibi yer tutucular boş sayılır,
//  - sondaki "Apt/Kat/Daire" eki ayrıştırılıp ilgili alanlara taşınır,
//  - kat/daire ayrı alanda varsa adres içindeki tekrarları ("Kat: 1, Daire
//    No: 4, Sancaktepe, İstanbul, Türkiye") atılır.
// Liste çağrısında (listTrendyolPackages) uygulanır → tüm tüketiciler temiz alır.

import type { TrendyolPackage } from "./client";

type Address = NonNullable<TrendyolPackage["address"]>;

const PLACEHOLDER = /^(?:tgo(?:\s*yemek)?|trendyol(?:\s*go)?(?:\s*yemek)?|-+|\.+)$/i;

// Eski arşiv kayıtlarında da yer tutucu kalmış olabilir → dışarıdan da kullanılır.
export const cleanTrendyolField = (v?: string | null): string => {
  const s = (v ?? "").trim();
  return PLACEHOLDER.test(s) ? "" : s;
};

// "… Apt: 10A, Kat: 9, Daire: 39" (adresin sonunda)
const SUFFIX = /[\s,]*\bApt\s*:\s*([^,]*?)\s*,\s*Kat\s*:\s*([^,]*?)\s*,\s*Daire\s*:\s*([^,]*?)\s*$/i;

function stripRedundant(line: string, a: Address, hasFloor: boolean, hasDoor: boolean): string {
  let s = line;
  if (hasFloor) s = s.replace(/,?\s*\b(?:Kat|Floor)\s*:\s*[^,]*/gi, "");
  if (hasDoor) s = s.replace(/,?\s*\b(?:Daire(?:\s*No)?|Flat\s*No)\s*[.:]+\s*[^,]*/gi, "");
  // Sondaki ", İlçe, İl, Türkiye" — ilçe/il kartta ayrı satırda görünüyor.
  const tails = ["Türkiye", "Turkey", a.city, a.district].filter(Boolean) as string[];
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tails) {
      const re = new RegExp(`,\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
      if (re.test(s)) {
        s = s.replace(re, "");
        changed = true;
      }
    }
  }
  return s.replace(/\s{2,}/g, " ").replace(/[\s,]+$/, "").trim();
}

export function normalizeTrendyolAddress(a: Address): Address {
  let address1 = (a.address1 ?? "").trim();
  let address2 = (a.address2 ?? "").trim();
  let apt = cleanTrendyolField(a.apartmentNumber);
  let floor = cleanTrendyolField(a.floor);
  let door = cleanTrendyolField(a.doorNumber);

  // Ek hangi satırdaysa oradan sök; alan boşsa ekteki değeri kullan.
  const take = (line: string): string => {
    const m = line.match(SUFFIX);
    if (!m) return line;
    apt ||= cleanTrendyolField(m[1]);
    floor ||= cleanTrendyolField(m[2]);
    door ||= cleanTrendyolField(m[3]);
    return line.slice(0, m.index).trim();
  };
  address2 = take(address2);
  address1 = take(address1);

  // Daire "0" bilgi taşımaz; kat "0" giriş kattır (korunur).
  if (/^0+$/.test(door)) door = "";

  address1 = stripRedundant(address1, a, !!floor, !!door);
  address2 = stripRedundant(address2, a, !!floor, !!door);

  return { ...a, address1, address2, apartmentNumber: apt, floor, doorNumber: door };
}

// Kat değerini insan-okur yazar: "0"/"giriş"/"zemin" → "Giriş kat".
export function floorLabel(floor?: string | null): string | null {
  const f = (floor ?? "").trim();
  if (!f) return null;
  if (/^(?:0+|giri[sş]|zemin)$/i.test(f)) return "Giriş kat";
  if (/^bodrum$/i.test(f)) return "Bodrum kat";
  if (/^-\d+$/.test(f)) return `Bodrum ${f.slice(1)}. kat`;
  return `Kat ${f}`;
}
