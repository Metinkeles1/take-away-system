"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import CustomerModel from "@/models/Customer";
import { type GeoPoint, type Order } from "@/types";
import {
  getOpenAccountsByPhone,
  openAccountsExcluding,
} from "@/lib/orders/openAccounts";

// Kurye sayfası için teslim edilmesi gereken siparişler.
// Sadece aktif (teslim/iptal olmamış) siparişleri döner — public sayfa olduğu
// için tüm geçmişi taşımayız, en yeni en üstte.
// Daha önce pinlenmiş konum varsa (müşteri = telefon eşleşmesi), onu
// order.customer.geo'ya iliştiririz; böylece aynı kişi tekrar sipariş verdiğinde
// pin hazır gelir ve "Yol Tarifi" metin geocode yerine kesin koordinata gider.
// Adres metni karşılaştırması bilinçli olarak yapılmaz: ufak yazım farkları
// (boşluk, addressDetail, telefon formatı) yüzünden pin sessizce düşmesin —
// telefon eşleşmesi yeterli. Kurye yanlış görürse karttaki "Düzelt" ile günceller.
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
    .select("phone geo")
    .lean();
  const geoByPhone = new Map<string, GeoPoint | undefined>();
  for (const c of savedCustomers) {
    const rec = c as unknown as { phone: string; geo?: GeoPoint };
    geoByPhone.set(rec.phone, rec.geo);
  }

  // Bu müşterilerin açık hesapları — kurye kapıda "eski borcu var" uyarısı görsün.
  const openByPhone = await getOpenAccountsByPhone(phones);

  return docs.map((doc) => {
    const customer = doc.customer as Order["customer"];
    // Siparişin kendi pini varsa onu, yoksa müşteriye (telefon) kayıtlı pini kullan.
    const geo = customer.geo ?? geoByPhone.get(customer.phone);

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
      customerOpenAccounts: openAccountsExcluding(
        openByPhone.get(customer.phone),
        doc.id,
      ),
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
      updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
    };
  });
}

// Kurye teslim ederken yakalanan GPS konumunu kaydeder:
//  • teslim edilen siparişin kendi kaydına (geçmiş için)
//  • müşteri kaydına (telefon üzerinden) — sonraki siparişlerde pin hazır gelir.
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
  // Müşteriye (telefon) kaydet — sonraki siparişlerde pin hazır gelsin.
  await CustomerModel.updateOne({ phone: customer.phone }, { $set: { geo } });
}
