import CustomerModel from "@/models/Customer";
import { toLocalPhone } from "@/lib/utils";
import { phoneMatchRegex } from "@/lib/customers/geoByPhone";
import {
  findMatchingAddress,
  newAddressId,
  normalizeCustomerAddresses,
  pickDefaultAddress,
} from "@/lib/customers/addresses";
import type { CustomerAddress, CustomerInfo, GeoPoint } from "@/types";

type CustomerDoc = Record<string, unknown> & { _id: unknown };

// İsim alanı aslında telefon numarası mı (sipariş ekranı ismi telefonla doldurur).
function isPhoneLike(name: string, phone: string): boolean {
  const digits = name.replace(/\D/g, "");
  return digits.length >= 7 && phone.replace(/\D/g, "").endsWith(digits.slice(-10));
}

// Telefona göre müşteri kaydını bulur: önce standart biçim (0 + 10 hane),
// yoksa rakam-bazlı eşleşme (eski kayıtlar farklı biçimde yazılmış olabilir).
export async function findCustomerByPhone(
  phone: string,
): Promise<CustomerDoc | null> {
  const local = toLocalPhone(phone);
  const exact = (await CustomerModel.findOne({ phone: local }).lean()) as
    | CustomerDoc
    | null;
  if (exact) return exact;
  const rx = phoneMatchRegex(phone);
  if (!rx) return null;
  return (await CustomerModel.findOne({ phone: rx }).lean()) as CustomerDoc | null;
}

// Adres listesini + varsayılanın üst seviye kopyasını (address/addressDetail)
// birlikte yazmak için $set gövdesi. Üst seviye `geo` da varsayılan adresin
// pini olur (eski uyum); pin okuyucuları adres bazlıdır (bkz. geoForCustomer).
export function addressesSetFields(
  addresses: CustomerAddress[],
  defaultAddressId?: string,
): Record<string, unknown> {
  const def = pickDefaultAddress(addresses, defaultAddressId);
  return {
    addresses,
    defaultAddressId: defaultAddressId ?? null,
    address: def?.address ?? "",
    addressDetail: def?.addressDetail ?? null,
    geo: def?.geo ?? null,
  };
}

// Siparişin müşteri bilgisini müşteri kaydına işler ve siparişin ait olduğu
// adresin id'sini döner:
//   - Adres metni kayıtlı bir adresle eşleşirse o adres kullanılır
//     (countOrder ise kullanım sayısı/son kullanım güncellenir).
//   - Eşleşmezse müşteriye YENİ adres olarak eklenir — eskisinin üzerine yazılmaz.
//   - Müşteri hiç yoksa oluşturulur.
// countOrder=false: sipariş düzenleme — yeni sipariş sayılmaz, sadece adres eklenir.
// updateAddressId: yeni adres eklemek yerine bu kayıtlı adresi güncelle.
export async function recordCustomerAddress(
  customer: Pick<
    CustomerInfo,
    "name" | "phone" | "address" | "addressDetail" | "district"
  >,
  opts: { countOrder: boolean; updateAddressId?: string },
): Promise<string> {
  const phone = toLocalPhone(customer.phone);
  const now = new Date();
  const existing = await findCustomerByPhone(phone);

  if (!existing) {
    const addr: CustomerAddress = {
      id: newAddressId(),
      address: customer.address,
      addressDetail: customer.addressDetail || undefined,
      district: customer.district || undefined,
      useCount: opts.countOrder ? 1 : 0,
      lastUsedAt: now,
    };
    await CustomerModel.create({
      id: `cust-${phone.replace(/\D/g, "")}`,
      name: customer.name || phone,
      phone,
      orderCount: opts.countOrder ? 1 : 0,
      ...addressesSetFields([addr]),
    });
    return addr.id;
  }

  const { addresses, defaultAddressId } = normalizeCustomerAddresses(
    existing as Parameters<typeof normalizeCustomerAddresses>[0],
  );
  const match = findMatchingAddress(
    addresses,
    customer.address,
    customer.addressDetail,
  );

  // Operatör "Kayıtlı adresi güncelle" dediyse: seçtiği adres yerinde düzeltilir
  // (pin ve kullanım sayısı korunur). Yeni metin başka bir kayıtlı adresle
  // birebir aynıysa o adres kullanılır — çift kayıt oluşmasın.
  const updateTarget = opts.updateAddressId
    ? addresses.find((a) => a.id === opts.updateAddressId)
    : undefined;

  let addressId: string;
  let next: CustomerAddress[];
  if (updateTarget && (!match || match.id === updateTarget.id)) {
    addressId = updateTarget.id;
    next = addresses.map((a) =>
      a.id === updateTarget.id
        ? {
            ...a,
            address: customer.address,
            addressDetail: customer.addressDetail || undefined,
            district: customer.district || a.district,
            ...(opts.countOrder
              ? { useCount: a.useCount + 1, lastUsedAt: now }
              : {}),
          }
        : a,
    );
  } else if (match) {
    addressId = match.id;
    next = addresses.map((a) =>
      a.id === match.id && opts.countOrder
        ? { ...a, useCount: a.useCount + 1, lastUsedAt: now }
        : a,
    );
  } else {
    addressId = newAddressId();
    next = [
      ...addresses,
      {
        id: addressId,
        address: customer.address,
        addressDetail: customer.addressDetail || undefined,
        district: customer.district || undefined,
        useCount: opts.countOrder ? 1 : 0,
        lastUsedAt: now,
      },
    ];
  }

  // Sipariş ekranı isim alanına telefonu yazıyor — müşteriler sekmesinde
  // girilmiş gerçek ismin üzerine numara yazılmasın. Yalnızca gerçek bir isim
  // geldiyse ya da kayıtta isim yoksa güncelle.
  const realName =
    !!customer.name && !isPhoneLike(customer.name, phone) ? customer.name : null;
  const setName = realName ?? (existing.name ? null : phone);

  await CustomerModel.updateOne(
    { _id: existing._id },
    {
      $set: {
        ...(setName ? { name: setName } : {}),
        ...addressesSetFields(next, defaultAddressId),
      },
      ...(opts.countOrder ? { $inc: { orderCount: 1 } } : {}),
    },
  );
  return addressId;
}

// Kuryenin teslimatta yakaladığı pini müşterinin İLGİLİ adresine yazar:
// siparişin bağlı olduğu adres id'si, yoksa adres metni eşleşmesi; hiçbiri
// yoksa adres müşteriye yeni adres olarak eklenir (pin başka adresin üzerine
// asla yazılmaz). Müşteri kaydı yoksa oluşturulur.
export async function saveAddressGeo(
  customer: Pick<
    CustomerInfo,
    "name" | "phone" | "address" | "addressDetail" | "district" | "addressId"
  >,
  geo: GeoPoint,
): Promise<void> {
  let existing = await findCustomerByPhone(customer.phone);
  let addressId = customer.addressId;
  if (!existing) {
    addressId = await recordCustomerAddress(customer, { countOrder: false });
    existing = await findCustomerByPhone(customer.phone);
    if (!existing) return;
  }

  const { addresses, defaultAddressId } = normalizeCustomerAddresses(
    existing as Parameters<typeof normalizeCustomerAddresses>[0],
  );
  let target = addressId
    ? addresses.find((a) => a.id === addressId)
    : undefined;
  target ??= findMatchingAddress(
    addresses,
    customer.address,
    customer.addressDetail,
  );

  const next: CustomerAddress[] = target
    ? addresses.map((a) => (a.id === target.id ? { ...a, geo } : a))
    : [
        ...addresses,
        {
          id: newAddressId(),
          address: customer.address,
          addressDetail: customer.addressDetail || undefined,
          district: customer.district || undefined,
          geo,
          useCount: 0,
          lastUsedAt: new Date(),
        },
      ];

  await CustomerModel.updateOne(
    { _id: existing._id },
    { $set: addressesSetFields(next, defaultAddressId) },
  );
}
