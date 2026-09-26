"use server";

import { connectDB } from "@/lib/mongodb";
import CustomerModel from "@/models/Customer";
import { parseStreet } from "@/lib/customers/streetKey";
import {
  estimateFromStreet,
  type StreetEstimate,
  type StreetRef,
} from "@/lib/customers/streetEstimate";

// Pinsiz adresler için sokak hafızası tahmini (bkz. lib/customers/streetEstimate).
// Tek sorguda: istenen sokakların pinli adreslerini çek, her adres için tahmin et.
// Sonuç yalnızca koordinat + açıklama — müşteri bilgisi dönmez.
const MAX_ITEMS = 100;

export async function estimateStreetGeos(
  items: {
    id: string;
    address: string;
    addressDetail?: string;
    district?: string;
  }[],
): Promise<Record<string, StreetEstimate>> {
  const parsed = items.slice(0, MAX_ITEMS).flatMap((it) => {
    const p = parseStreet(it.address ?? "", it.addressDetail);
    return p ? [{ id: it.id, district: it.district, ...p }] : [];
  });
  if (parsed.length === 0) return {};

  const keys = [...new Set(parsed.map((p) => p.street))];
  await connectDB();
  const customers = await CustomerModel.find({
    addresses: { $elemMatch: { streetKey: { $in: keys }, geo: { $ne: null } } },
  })
    .select("addresses.streetKey addresses.mahalleKey addresses.doorNo addresses.district addresses.geo")
    .lean();

  const byStreet = new Map<string, StreetRef[]>();
  for (const c of customers) {
    const list = (c as unknown as {
      addresses?: {
        streetKey?: string | null;
        mahalleKey?: string | null;
        doorNo?: number | null;
        district?: string | null;
        geo?: { lat?: number; lng?: number } | null;
      }[];
    }).addresses;
    for (const a of list ?? []) {
      const lat = a.geo?.lat;
      const lng = a.geo?.lng;
      if (!a.streetKey || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const refs = byStreet.get(a.streetKey) ?? [];
      refs.push({
        mahalle: a.mahalleKey ?? undefined,
        doorNo: a.doorNo ?? undefined,
        district: a.district ?? undefined,
        lat: lat as number,
        lng: lng as number,
      });
      byStreet.set(a.streetKey, refs);
    }
  }

  const out: Record<string, StreetEstimate> = {};
  for (const p of parsed) {
    const est = estimateFromStreet(p, byStreet.get(p.street) ?? []);
    if (est) out[p.id] = est;
  }
  return out;
}
