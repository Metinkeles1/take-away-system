import CustomerModel from "@/models/Customer";
import { phoneKey } from "@/lib/utils";
import type { GeoPoint } from "@/types";

// Müşteri kaydındaki pini (geo) telefona göre çeker — AMA eşleştirme telefonun
// SADECE rakamlarına (son 10 hane) göre yapılır. Aynı müşterinin "0555 123 45 67",
// "+90 555…", "5551234567" gibi farklı formatta yazılmış numaraları aynı pini
// bulur. Eskiden birebir string eşleşmesi vardı; bir siparişte numara başka
// formatta girilince "daha önce pinlenen adres" yeni siparişte görünmüyordu.
//
// Sorgu da formatı umursamaz: her anahtar için rakamlar arasına serbest ayraç
// (\D*) koyan bir regex üretir → "0555 123 45 67" gibi boşluklu kayıtlar da
// eşleşir. Yalnızca geo'su olan kayıtlar taranır (pin yoksa zaten ilgisiz).
// Bir telefonu, formatı (boşluk/+90/0) umursamadan eşleştiren regex üretir:
// rakamların arasına serbest ayraç (\D*) koyar, sonda fazladan rakam gelmesin.
// Yeterli rakam yoksa null (regex taraması yapmaya değmez).
export function phoneMatchRegex(phone: string): RegExp | null {
  const k = phoneKey(phone);
  if (k.length < 7) return null;
  return new RegExp(k.split("").join("\\D*") + "(?:\\D|$)");
}

export async function getGeoByPhone(
  phones: string[],
): Promise<Map<string, GeoPoint>> {
  const keys = [
    ...new Set(phones.map(phoneKey).filter((k) => k.length >= 7)),
  ];
  if (keys.length === 0) return new Map();

  const ors = keys.map((k) => ({
    // Rakamlar arası ayraç serbest; sonda başka rakam gelmesin (yanlış eşleşme önle).
    phone: new RegExp(k.split("").join("\\D*") + "(?:\\D|$)"),
  }));

  const customers = await CustomerModel.find({ geo: { $ne: null }, $or: ors })
    .select("phone geo")
    .lean();

  const map = new Map<string, GeoPoint>();
  for (const c of customers) {
    const rec = c as unknown as { phone: string; geo?: GeoPoint };
    if (rec.geo) map.set(phoneKey(rec.phone), rec.geo);
  }
  return map;
}

// getGeoByPhone'un döndürdüğü map'ten bir siparişin telefonuna karşılık gelen
// pini, format farkını yok sayarak okur.
export function geoForPhone(
  map: Map<string, GeoPoint>,
  phone: string,
): GeoPoint | undefined {
  return map.get(phoneKey(phone));
}
