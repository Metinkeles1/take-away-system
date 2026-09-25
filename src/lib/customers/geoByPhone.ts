import CustomerModel from "@/models/Customer";
import { phoneKey } from "@/lib/utils";
import type { CustomerAddress, GeoPoint } from "@/types";
import {
  findMatchingAddress,
  normalizeCustomerAddresses,
} from "@/lib/customers/addresses";

// Telefon eşleştirmesi — AMA eşleştirme telefonun
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

// Telefon (son 10 hane) → müşterinin adres listesi. Pin artık ADRESE aittir;
// bir siparişin pini, müşterinin o siparişin adresine ait pinidir
// (bkz. geoForCustomer). Aynı numaranın başka adresinin pini ödünç alınmaz.
export type AddressBook = Map<string, CustomerAddress[]>;

export async function getAddressBook(phones: string[]): Promise<AddressBook> {
  const keys = [
    ...new Set(phones.map(phoneKey).filter((k) => k.length >= 7)),
  ];
  if (keys.length === 0) return new Map();

  const ors = keys.map((k) => ({ phone: phoneMatchRegex(k) as RegExp }));

  // Yalnızca pini olan kayıtlar (eski üst seviye geo ya da adres pini).
  const customers = await CustomerModel.find({
    $and: [
      { $or: ors },
      { $or: [{ geo: { $ne: null } }, { "addresses.geo": { $ne: null } }] },
    ],
  })
    .select("phone address addressDetail geo addresses defaultAddressId orderCount updatedAt")
    .lean();

  const book: AddressBook = new Map();
  for (const c of customers) {
    const rec = c as unknown as { phone: string };
    const { addresses } = normalizeCustomerAddresses(
      c as Parameters<typeof normalizeCustomerAddresses>[0],
    );
    book.set(phoneKey(rec.phone), addresses);
  }
  return book;
}

// Siparişin adresine ait kayıtlı pin: önce siparişin bağlı olduğu adres id'si,
// yoksa (eski/Trendyol siparişi) adres metni eşleşmesi. Bulunamazsa undefined.
export function geoForCustomer(
  book: AddressBook,
  customer: {
    phone?: string;
    address?: string;
    addressDetail?: string;
    addressId?: string;
  },
): GeoPoint | undefined {
  if (!customer.phone) return undefined;
  const list = book.get(phoneKey(customer.phone));
  if (!list) return undefined;
  const byId = customer.addressId
    ? list.find((a) => a.id === customer.addressId)
    : undefined;
  const hit =
    byId ??
    (customer.address
      ? findMatchingAddress(list, customer.address, customer.addressDetail)
      : undefined);
  return hit?.geo;
}
