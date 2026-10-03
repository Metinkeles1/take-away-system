"use server";

import { connectDB } from "@/lib/mongodb";
import CustomerModel from "@/models/Customer";
import TrendyolOrderModel from "@/models/TrendyolOrder";
import { parseStreet } from "@/lib/customers/streetKey";
import {
  estimateFromStreet,
  type StreetEstimate,
  type StreetRef,
} from "@/lib/customers/streetEstimate";

// Pinsiz adresler için sokak hafızası tahmini (bkz. lib/customers/streetEstimate).
// İstenen sokakların pinli adreslerini iki kaynaktan çek — kendi müşteri
// kayıtlarımız + Trendyol arşivi (Trendyol siparişleri müşterinin haritada
// seçtiği pinle gelir) — ve her adres için tahmin et.
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
  const [customers, trendyol] = await Promise.all([
    CustomerModel.find({
      addresses: { $elemMatch: { streetKey: { $in: keys }, geo: { $ne: null } } },
    })
      .select("addresses.streetKey addresses.mahalleKey addresses.doorNo addresses.district addresses.geo")
      .lean(),
    TrendyolOrderModel.find({ streetKey: { $in: keys }, lat: { $ne: null }, lng: { $ne: null } })
      .select({ streetKey: 1, mahalleKey: 1, doorNo: 1, district: 1, lat: 1, lng: 1, _id: 0 })
      .lean(),
  ]);

  // Aynı müşteri aynı adrese defalarca sipariş verir — her sipariş ayrı ref
  // olursa ortalamayı o noktaya çeker. Aynı numara + ~10 m içindeki pinler tek sayılır.
  const byStreet = new Map<string, StreetRef[]>();
  const seen = new Set<string>();
  const add = (streetKey: string, ref: StreetRef) => {
    const k = `${streetKey}|${ref.doorNo ?? ""}|${ref.lat.toFixed(4)}|${ref.lng.toFixed(4)}`;
    if (seen.has(k)) return;
    seen.add(k);
    const refs = byStreet.get(streetKey) ?? [];
    refs.push(ref);
    byStreet.set(streetKey, refs);
  };
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
      add(a.streetKey, {
        mahalle: a.mahalleKey ?? undefined,
        doorNo: a.doorNo ?? undefined,
        district: a.district ?? undefined,
        lat: lat as number,
        lng: lng as number,
        source: "own",
      });
    }
  }
  for (const t of trendyol) {
    if (!t.streetKey || !Number.isFinite(t.lat) || !Number.isFinite(t.lng)) continue;
    add(t.streetKey, {
      mahalle: t.mahalleKey ?? undefined,
      doorNo: t.doorNo ?? undefined,
      district: t.district || undefined,
      lat: t.lat as number,
      lng: t.lng as number,
      source: "trendyol",
    });
  }

  const out: Record<string, StreetEstimate> = {};
  for (const p of parsed) {
    const est = estimateFromStreet(p, byStreet.get(p.street) ?? []);
    if (est) out[p.id] = est;
  }
  return out;
}
