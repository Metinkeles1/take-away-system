import { type SavedCustomer } from "@/types";
import { pickDefaultAddress } from "@/lib/customers/addresses";

// Rehber kişisinin alanları — CSV dışa aktarımı ve Google Contacts API
// senkronu aynı kişiyi üretsin diye tek yerde.

// Telefonu E.164'e çevir: 5XXXXXXXXX → +905XXXXXXXXX, 0XXXXXXXXXX / 90XXXXXXXXXX → +90...
// Sonuna çöp eklenmiş cep numaraları ("05423790986 - 1") cep kısmından kurtarılır.
// Anlamlı bir numara çıkmazsa "" döner → rehbere gönderilmez (eskiden "+<rakamlar>"
// yazılıyordu, "+904237909861" gibi bozuk numaralar oradan geliyordu).
export function normalizePhone(p: string): string {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10 && /^[2-5]/.test(digits)) return `+90${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("90")) return `+${digits}`;
  const mobile = digits.match(/^(?:90|0)?(5\d{9})/);
  return mobile ? `+90${mobile[1]}` : "";
}

// İsim alanı aslında numara mı: sadece rakam/boşluk/+-(). ve en az 7 rakam.
// Sipariş ekranı ismi çoğu zaman telefonla dolduruyor ("5011015539",
// "501 372 91 79", "05423790986 - 1"); bunlar rehbere isim olarak gitmemeli.
function isPhoneLikeName(name: string): boolean {
  return /^[\d\s+().-]+$/.test(name) && name.replace(/\D/g, "").length >= 7;
}

const oneLine = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

// Rehberdeki isim: gerçek ad; ad numaraysa/boşsa adres + bina/daire ("Birsel
// sokak 23 e 3" — yalnız sokak yazılırsa aynı sokaktaki müşteriler rehberde
// aynı isimle görünür); o da yoksa "Müşteri 1234".
export function buildFirstName(c: SavedCustomer): string {
  const name = oneLine(c.name ?? "");
  if (name && !isPhoneLikeName(name)) return name;
  if (c.address && c.address.trim()) {
    const detail = c.addressDetail?.trim() ? oneLine(c.addressDetail) : "";
    return detail ? `${oneLine(c.address)} ${detail}` : oneLine(c.address);
  }
  const phoneDigits = c.phone.replace(/\D/g, "");
  return phoneDigits ? `Müşteri ${phoneDigits.slice(-4)}` : "Müşteri";
}

// Rehberin "Adres" alanına yazılacak adresler — varsayılan ilk sırada.
export interface ContactAddress {
  street: string; // sokak / cadde / mahalle metni
  detail?: string; // bina / daire / tarif
}

export function buildAddresses(c: SavedCustomer): ContactAddress[] {
  const def = pickDefaultAddress(c.addresses ?? [], c.defaultAddressId);
  const list: { address?: string; addressDetail?: string }[] = c.addresses?.length
    ? [...(def ? [def] : []), ...c.addresses.filter((a) => a.id !== def?.id)]
    : [{ address: c.address, addressDetail: c.addressDetail }];
  return list
    .filter((a) => a.address?.trim())
    .map((a) => ({
      street: oneLine(a.address!),
      detail: a.addressDetail?.trim() ? oneLine(a.addressDetail) : undefined,
    }));
}

// Varsayılan olmayan adresler (varsa) — " | " ile birleştirilmiş metin.
function buildOtherAddresses(c: SavedCustomer): string {
  return buildAddresses(c)
    .slice(1)
    .map((a) => (a.detail ? `${a.street} - ${a.detail}` : a.street))
    .join(" | ");
}

// Notlar: adres + bina/daire (+ diğer adresler). Adres ayrıca Adres alanında
// da var; nota da yazılıyor çünkü telefon rehberinde en görünür yer burası ve
// CSV'de Adres sütunu yok. Sipariş sayısı gibi zamanla DEĞİŞEN bilgi yazılmaz:
// aynı kişi tekrar içe aktarılırsa Google farklı notları birleştiriyordu.
export function buildNotes(c: SavedCustomer): string {
  const [def] = buildAddresses(c);
  const parts: string[] = [];
  // İsim zaten "adres + bina/daire" ise nota tekrar yazılmaz.
  const nameIsAddress = def && buildFirstName(c).startsWith(def.street);
  if (def && !nameIsAddress) {
    parts.push(def.street);
    if (def.detail) parts.push(def.detail);
  }
  const others = buildOtherAddresses(c);
  if (others) parts.push(`Diğer adresler: ${others}`);
  return parts.join(" · ");
}
