"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import CustomerModel from "@/models/Customer";
import { type GeoPoint, type Order } from "@/types";
import { notifyOrdersChanged } from "@/lib/pusher/server";
import {
  getMultiCourierMode,
  getShopLocation,
  getShopIban,
  type ShopLocation,
  type ShopIban,
} from "@/actions/settings";
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
      courier:
        (doc as unknown as { courier?: string }).courier ?? undefined,
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

// Kurye bir siparişi üstlenir ("Tüm Paketler"de check'ler). Yarış durumunda
// (iki kurye aynı anda) ilk yazan kazanır: sadece kurye boşsa veya zaten aynı
// kuryedeyse yazılır. Başkası almışsa kim aldığı döner → UI kilitler.
export async function claimOrder(
  orderId: string,
  courier: string,
): Promise<{ ok: boolean; error?: string; takenBy?: string }> {
  try {
    const name = courier.trim();
    if (!name) return { ok: false, error: "Kurye adı gerekli" };
    await connectDB();

    const doc = await OrderModel.findOneAndUpdate(
      {
        id: orderId,
        $or: [
          { courier: { $exists: false } },
          { courier: null },
          { courier: name },
        ],
      },
      { $set: { courier: name } },
      { new: true },
    ).lean();

    if (!doc) {
      // Sipariş ya yok ya da başka kurye üstlenmiş — mevcut sahibini döndür.
      const current = await OrderModel.findOne({ id: orderId })
        .select("courier")
        .lean();
      const takenBy = (current as unknown as { courier?: string })?.courier;
      return {
        ok: false,
        error: takenBy ? `${takenBy} bu paketi aldı` : "Sipariş bulunamadı",
        takenBy: takenBy ?? undefined,
      };
    }

    await notifyOrdersChanged("courier-claimed");
    return { ok: true };
  } catch (error) {
    console.error("[claimOrder]", error);
    return { ok: false, error: "Paket alınamadı" };
  }
}

// Admin panelden kurye atar / değiştirir / kaldırır. Kuryenin self-claim'inden
// farklı olarak yarış koşulu yok — son söz admin'de (yanlış üstlenmeyi düzeltmek,
// işi bırakan kuryenin paketini boşa almak için). courier null → havuza döner.
export async function setOrderCourier(
  orderId: string,
  courier: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();
    const name = courier?.trim();
    const update = name
      ? { $set: { courier: name } }
      : { $unset: { courier: "" } };
    const doc = await OrderModel.findOneAndUpdate({ id: orderId }, update);
    if (!doc) return { ok: false, error: "Sipariş bulunamadı" };
    await notifyOrdersChanged("courier-assigned");
    return { ok: true };
  } catch (error) {
    console.error("[setOrderCourier]", error);
    return { ok: false, error: "Kurye atanamadı" };
  }
}

// Birden çok boş paketi tek hamlede üstlen ("Hepsini Al"). Tek updateMany + tek
// Pusher bildirimi — eskiden her paket ayrı çağrılıp N kat DB/Pusher yükü çıkıyordu.
// Yalnızca hâlâ boş olanlar yazılır (arada başkası kapmışsa atlanır, çakışmaz).
export async function claimManyOrders(
  orderIds: string[],
  courier: string,
): Promise<{ ok: boolean; error?: string; claimed?: number }> {
  try {
    const name = courier.trim();
    if (!name || orderIds.length === 0) return { ok: true, claimed: 0 };
    await connectDB();

    const res = await OrderModel.updateMany(
      {
        id: { $in: orderIds },
        $or: [{ courier: { $exists: false } }, { courier: null }],
      },
      { $set: { courier: name } },
    );

    if (res.modifiedCount > 0) await notifyOrdersChanged("courier-claimed-bulk");
    return { ok: true, claimed: res.modifiedCount };
  } catch (error) {
    console.error("[claimManyOrders]", error);
    return { ok: false, error: "Paketler alınamadı" };
  }
}

// Kurye ekranının tek round-trip beslemesi: aktif paketler + çoklu kurye modu
// birlikte döner. Eskiden mod her poll'da AYRI bir sunucu çağrısıyla çekiliyordu;
// artık siparişlerle aynı turda (paralel sorgu) gelir → ekstra gidiş-dönüş yok.
export async function getCourierBoard(): Promise<{
  orders: Order[];
  multiCourierMode: boolean;
  shopLocation: ShopLocation | null;
  shopIban: ShopIban | null;
}> {
  const [orders, multiCourierMode, shopLocation, shopIban] = await Promise.all([
    getCourierOrders(),
    getMultiCourierMode(),
    getShopLocation(),
    getShopIban(),
  ]);
  return { orders, multiCourierMode, shopLocation, shopIban };
}

// Kurye üstlenmeyi bırakır (check'i kaldırır) → sipariş havuza döner. Güvenlik:
// yalnızca paketi alan kurye bırakabilir (başkasının check'ini kaldıramaz).
export async function unclaimOrder(
  orderId: string,
  courier: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const name = courier.trim();
    await connectDB();

    const doc = await OrderModel.findOneAndUpdate(
      { id: orderId, courier: name },
      { $unset: { courier: "" } },
    );
    if (!doc) return { ok: false, error: "Bu paketi sen almamışsın" };

    await notifyOrdersChanged("courier-unclaimed");
    return { ok: true };
  } catch (error) {
    console.error("[unclaimOrder]", error);
    return { ok: false, error: "Paket bırakılamadı" };
  }
}
