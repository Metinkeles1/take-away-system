import type { CustomerAddress, GeoPoint } from "@/types";

// Müşteri adres listesi yardımcıları — saf fonksiyonlar (sunucu + istemci).

// Aynı adresi farklı yazımlarla (büyük/küçük harf, fazla boşluk, noktalama)
// tekrar kaydetmemek için karşılaştırma anahtarı. Daire/kat (addressDetail)
// anahtara dahildir: aynı binada farklı daire = farklı adres.
export function addressKey(address: string, addressDetail?: string): string {
  const norm = (s?: string) =>
    (s ?? "")
      .toLocaleLowerCase("tr-TR")
      .replace(/[-.,;:/\\_'"()]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(address)}|${norm(addressDetail)}`;
}

export function newAddressId(): string {
  return `addr-${crypto.randomUUID()}`;
}

// Eski (tek adresli) kayıttan türetilen adresin sabit id'si — okuma tekrarlandığında
// aynı id gelsin, kaydedildiğinde de aynı kalsın.
export const LEGACY_ADDRESS_ID = "addr-legacy";

type RawCustomer = {
  address?: string;
  addressDetail?: string;
  geo?: GeoPoint | null;
  updatedAt?: Date;
  orderCount?: number;
  addresses?: Partial<CustomerAddress>[] | null;
  defaultAddressId?: string | null;
};

// DB kaydından adres listesini çıkarır. `addresses` boş olan eski kayıtlarda
// üst seviye address/geo'dan tek adres türetilir (toplu dönüşüm gerekmez).
export function normalizeCustomerAddresses(doc: RawCustomer): {
  addresses: CustomerAddress[];
  defaultAddressId?: string;
} {
  const list = (doc.addresses ?? [])
    .filter((a): a is Partial<CustomerAddress> & { id: string; address: string } =>
      !!a?.id && !!a?.address,
    )
    .map((a) => ({
      id: a.id,
      address: a.address,
      addressDetail: a.addressDetail || undefined,
      district: a.district || undefined,
      geo: a.geo ?? undefined,
      useCount: a.useCount ?? 0,
      lastUsedAt: a.lastUsedAt ?? doc.updatedAt ?? new Date(0),
    }));

  if (list.length > 0) {
    const def = list.some((a) => a.id === doc.defaultAddressId)
      ? (doc.defaultAddressId as string)
      : undefined;
    return { addresses: list, defaultAddressId: def };
  }

  if (!doc.address) return { addresses: [] };
  return {
    addresses: [
      {
        id: LEGACY_ADDRESS_ID,
        address: doc.address,
        addressDetail: doc.addressDetail || undefined,
        geo: doc.geo ?? undefined,
        useCount: doc.orderCount ?? 0,
        lastUsedAt: doc.updatedAt ?? new Date(0),
      },
    ],
  };
}

// Varsayılan adres: elle seçilmişse o, yoksa en son kullanılan.
export function pickDefaultAddress(
  addresses: CustomerAddress[],
  defaultAddressId?: string,
): CustomerAddress | undefined {
  if (defaultAddressId) {
    const hit = addresses.find((a) => a.id === defaultAddressId);
    if (hit) return hit;
  }
  return [...addresses].sort(
    (a, b) => +new Date(b.lastUsedAt) - +new Date(a.lastUsedAt),
  )[0];
}

// Metni aynı olan (addressKey eşleşen) kayıtlı adresi bulur.
export function findMatchingAddress(
  addresses: CustomerAddress[],
  address: string,
  addressDetail?: string,
): CustomerAddress | undefined {
  const key = addressKey(address, addressDetail);
  return addresses.find((a) => addressKey(a.address, a.addressDetail) === key);
}
