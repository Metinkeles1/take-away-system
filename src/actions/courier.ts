"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import CustomerModel from "@/models/Customer";
import { type GeoPoint, type Order } from "@/types";

// Adres karşılaştırmasını gevşet: boşluk/büyük-küçük harf farkları yüzünden
// kayıtlı pin gereksiz yere geçersiz sayılıp kuryeye her sefer yeniden
// pinletmesin. Türkçe-duyarlı küçük harf + boşluk sadeleştirme.
function normalizeAddr(s?: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
}

// Kurye sayfası için teslim edilmesi gereken siparişler.
// Sadece aktif (teslim/iptal olmamış) siparişleri döner — public sayfa olduğu
// için tüm geçmişi taşımayız, en yeni en üstte.
// Daha önce teslim sırasında pinlenmiş konum varsa (telefon + aynı adres),
// onu order.customer.geo'ya iliştiririz; böylece "Yol Tarifi Al" metin geocode
// yerine kesin koordinata gider.
export async function getCourierOrders(): Promise<Order[]> {
  await connectDB();

  const docs = await OrderModel.find({
    status: { $in: ["pending", "preparing", "on-the-way"] },
  })
    .sort({ createdAt: -1 })
    .lean();

  // Bu siparişlerdeki müşterilerin kayıtlı pinlerini tek sorguda çek.
  const phones = [...new Set(docs.map((d) => (d.customer as Order["customer"]).phone))];
  const savedCustomers = await CustomerModel.find({ phone: { $in: phones } })
    .select("phone geo geoAddress")
    .lean();
  const geoByPhone = new Map<string, { geo?: GeoPoint; geoAddress?: string }>();
  for (const c of savedCustomers) {
    const rec = c as unknown as { phone: string; geo?: GeoPoint; geoAddress?: string };
    geoByPhone.set(rec.phone, { geo: rec.geo, geoAddress: rec.geoAddress });
  }

  return docs.map((doc) => {
    const customer = doc.customer as Order["customer"];
    // Kayıtlı pin yalnızca adres değişmediyse geçerli sayılır.
    const saved = geoByPhone.get(customer.phone);
    const geo =
      customer.geo ??
      (saved?.geo &&
      normalizeAddr(saved.geoAddress) === normalizeAddr(customer.address)
        ? saved.geo
        : undefined);

    return {
      id: doc.id,
      orderNumber: doc.orderNumber,
      items: doc.items as Order["items"],
      customer: { ...customer, geo },
      payment: doc.payment as Order["payment"],
      status: doc.status as Order["status"],
      notes: doc.notes ?? undefined,
      subtotal: doc.subtotal,
      deliveryFee: doc.deliveryFee,
      total: doc.total,
      source: (doc.source as Order["source"]) ?? "manual",
      externalRef: doc.externalRef ?? undefined,
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
      updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
    };
  });
}

// Kurye teslim ederken yakalanan GPS konumunu kaydeder:
//  • teslim edilen siparişin kendi kaydına (geçmiş için)
//  • müşteri kaydına (telefon + o adres için) — sonraki siparişlerde pin hazır.
export async function saveDeliveryLocation(
  orderId: string,
  geo: GeoPoint,
): Promise<void> {
  if (
    !Number.isFinite(geo.lat) ||
    !Number.isFinite(geo.lng) ||
    Math.abs(geo.lat) > 90 ||
    Math.abs(geo.lng) > 180
  ) {
    return; // geçersiz koordinat — sessiz geç
  }

  await connectDB();

  const doc = await OrderModel.findOneAndUpdate(
    { id: orderId },
    { $set: { "customer.geo": geo } },
    { new: true },
  ).lean();
  if (!doc) return;

  const customer = (doc as unknown as { customer: Order["customer"] }).customer;
  await CustomerModel.updateOne(
    { phone: customer.phone },
    { $set: { geo, geoAddress: customer.address } },
  );
}
