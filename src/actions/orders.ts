"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import { getGeoByPhone, geoForPhone } from "@/lib/customers/geoByPhone";
import { toLocalPhone } from "@/lib/utils";
import {
  cancelTrendyolPackage,
  deliverTrendyolPackage,
  markTrendyolPackageInvoiced,
  shipTrendyolPackage,
} from "@/lib/integrations/trendyol/client";
import {
  type CustomerOpenAccounts,
  type GeoPoint,
  type MealCardBrand,
  type Order,
  type OrderStatus,
  type PaymentInfo,
  type PaymentMethod,
  type PaymentRecord,
} from "@/types";
import { notifyOrdersChanged } from "@/lib/pusher/server";
import {
  getOpenAccountsByPhone,
  openAccountsExcluding,
} from "@/lib/orders/openAccounts";

// Dahili sipariş durumu → Trendyol GO Yemek API çağrı zinciri.
// "preparing" webhook'ta otomatik "picked" (kabul) atılırken yapılıyor — burada tekrarlanmaz.
//
// "on-the-way" : önce invoiced (hazırlık bitti) sonra manual-shipped (yola çıktı)
// "delivered"  : manual-delivered
// "cancelled"  : unsupplied
async function syncStatusToTrendyol(packageId: string, status: OrderStatus) {
  try {
    if (status === "cancelled") {
      const r = await cancelTrendyolPackage(packageId);
      if (!r.ok) console.warn("[trendyol cancel]", r.status, r.error);
      return;
    }
    if (status === "on-the-way") {
      // Trendyol akışına göre "manual-shipped" çağrılabilmesi için önce
      // "invoiced" (hazırlık bitti) statüsünden geçmek gerekir.
      const inv = await markTrendyolPackageInvoiced(packageId);
      if (!inv.ok) console.warn("[trendyol invoiced]", inv.status, inv.error);
      const ship = await shipTrendyolPackage(packageId);
      if (!ship.ok) console.warn("[trendyol manual-shipped]", ship.status, ship.error);
      return;
    }
    if (status === "delivered") {
      const r = await deliverTrendyolPackage(packageId);
      if (!r.ok) console.warn("[trendyol manual-delivered]", r.status, r.error);
      return;
    }
  } catch (err) {
    console.warn("[trendyol sync exception]", err);
  }
}

// Siparişler listesi penceresi: canlı operasyon panelinde tüm geçmişi taşımak
// gereksiz (her focus/echo'da koleksiyonun tamamı aktarılır). Aktif siparişler
// ve açık hesaplar daima gelir; tamamlanmış/iptal geçmişi seçilen döneme göre
// sınırlanır, güvenlik için tavan vardır. Daha eski kayıtlar rapor/settlement
// sayfalarından okunur.
export type OrdersPeriod = "today" | "week" | "month" | "all";

// Liste payload tavanı: günlük operasyon için 500 yeterli; "Tümü" seçilince
// daha geniş arama yapılabilsin diye tavan yükseltilir (yine de sınırsız değil).
const ORDERS_MAX = 500;
const ORDERS_MAX_ALL = 2000;
const ACTIVE_STATUSES = ["pending", "preparing", "on-the-way"];

// Seçilen döneme göre "geçmiş" kesme tarihi. "all" → kesme yok (tüm kayıtlar).
function periodCutoff(period: OrdersPeriod): Date | null {
  if (period === "all") return null;
  if (period === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const days = period === "week" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Kısmi tahsilat alanlarını doc'tan çıkarır (DB → Order eşlemesinde tekrarı önler).
function ledgerFields(doc: unknown): {
  payments?: PaymentRecord[];
  paidAmount?: number;
} {
  const d = doc as { payments?: PaymentRecord[]; paidAmount?: number };
  return {
    payments: d.payments ?? undefined,
    paidAmount: d.paidAmount ?? undefined,
  };
}

// Teslim metriklerini doc'tan çıkarır (okuma mapper'larında tekrarı önler).
function deliveryFields(doc: unknown): {
  deliveredAt?: Date;
  deliveryDurationMin?: number;
} {
  const d = doc as { deliveredAt?: Date; deliveryDurationMin?: number };
  return {
    deliveredAt: d.deliveredAt ?? undefined,
    deliveryDurationMin: d.deliveryDurationMin ?? undefined,
  };
}

// Siparişin kendi pini varsa onu, yoksa müşteriye (telefon) kayıtlı pini kullanır.
// Eşleştirme telefonun rakamlarına göre (geoForPhone) — format farkını yok sayar.
function withFallbackGeo(
  customer: Order["customer"],
  geoByPhone: Map<string, GeoPoint>,
): Order["customer"] {
  if (customer.geo) return customer;
  const geo = geoForPhone(geoByPhone, customer.phone);
  return geo ? { ...customer, geo } : customer;
}

export async function getOrders(period: OrdersPeriod = "week"): Promise<Order[]> {
  await connectDB();

  const cutoff = periodCutoff(period);

  // "all" → tüm siparişler (tavanla). Aksi halde aktif iş + açık hesaplar daima
  // görünür, üstüne seçilen dönemin geçmişi eklenir.
  const query = cutoff
    ? {
        $or: [
          { status: { $in: ACTIVE_STATUSES } }, // aktif iş daima görünür
          { paymentStatus: "open" }, // açık hesaplar daima görünür
          { createdAt: { $gte: cutoff } }, // seçilen dönemin geçmişi
        ],
      }
    : {};

  const docs = await OrderModel.find(query)
    .sort({ createdAt: -1 })
    .limit(cutoff ? ORDERS_MAX : ORDERS_MAX_ALL)
    .lean();

  // Bu penceredeki müşterilerin açık hesaplarını tek sorguda çek; her siparişe
  // "aynı müşterinin diğer açık hesapları" uyarısını iliştir (kendisi hariç).
  const phones = docs.map((d) => (d.customer as Order["customer"]).phone);
  const openByPhone = await getOpenAccountsByPhone(phones);

  // Kurye ekranıyla aynı mantık: siparişin kendi pini yoksa, müşteriye (telefon)
  // kayıtlı pini kullan. Aksi halde kurye bir önceki teslimatta pinlediği konumu
  // görürken, bu sipariş henüz pinlenmediği için bilgisayarda konum boş kalıyordu.
  const geoByPhone = await getGeoByPhone(phones);

  return docs.map((doc) => ({
    id: doc.id,
    orderNumber: doc.orderNumber,
    items: doc.items as Order["items"],
    customer: withFallbackGeo(doc.customer as Order["customer"], geoByPhone),
    payment: doc.payment as Order["payment"],
    status: doc.status as Order["status"],
    notes: doc.notes ?? undefined,
    subtotal: doc.subtotal,
    deliveryFee: doc.deliveryFee,
    total: doc.total,
    source: (doc.source as Order["source"]) ?? "manual",
    externalRef: doc.externalRef ?? undefined,
    paymentStatus: (doc.paymentStatus as Order["paymentStatus"]) ?? "paid",
    paidAt: (doc as unknown as { paidAt?: Date }).paidAt ?? undefined,
    ...ledgerFields(doc),
    courier: (doc as unknown as { courier?: string }).courier ?? undefined,
    ...deliveryFields(doc),
    customerOpenAccounts: openAccountsExcluding(
      openByPhone.get((doc.customer as Order["customer"]).phone),
      doc.id,
    ),
    createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
  }));
}

// ─── Tek sipariş getir ────────────────────────────────────────────────────────
export async function getOrderById(id: string): Promise<Order | null> {
  await connectDB();

  const doc = await OrderModel.findOne({ id }).lean();
  if (!doc) return null;

  const customer = doc.customer as Order["customer"];
  // Siparişin kendi pini yoksa müşteriye (telefon) kayıtlı pini kullan — kurye
  // ekranıyla tutarlı olsun (bkz. getCourierOrders).
  const geoByPhone = customer.geo ? null : await getGeoByPhone([customer.phone]);

  return {
    id: doc.id,
    orderNumber: doc.orderNumber,
    items: doc.items as Order["items"],
    customer: geoByPhone ? withFallbackGeo(customer, geoByPhone) : customer,
    payment: doc.payment as Order["payment"],
    status: doc.status as Order["status"],
    notes: doc.notes ?? undefined,
    subtotal: doc.subtotal,
    deliveryFee: doc.deliveryFee,
    total: doc.total,
    source: (doc.source as Order["source"]) ?? "manual",
    externalRef: doc.externalRef ?? undefined,
    paymentStatus: (doc.paymentStatus as Order["paymentStatus"]) ?? "paid",
    paidAt: (doc as unknown as { paidAt?: Date }).paidAt ?? undefined,
    ...ledgerFields(doc),
    courier: (doc as unknown as { courier?: string }).courier ?? undefined,
    ...deliveryFields(doc),
    createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
  };
}

// ─── Sipariş kaydet ───────────────────────────────────────────────────────────
export async function createOrder(
  order: Order,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    // ibanName ve ibanNumber DB'ye kaydedilmez, sadece UI'da (fiş) kullanılır
    const { ...paymentForDB } = order.payment;

    // Telefonu tek standarda çek (0 + 10 hane) — "Ara" düğmesi çalışsın, eşleşme tutsun.
    const customerForDB = {
      ...order.customer,
      phone: toLocalPhone(order.customer.phone),
    };

    await OrderModel.create({
      id: order.id,
      orderNumber: order.orderNumber,
      items: order.items,
      customer: customerForDB,
      payment: paymentForDB,
      status: order.status ?? "pending",
      notes: order.notes,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      source: order.source ?? "manual",
      externalRef: order.externalRef,
      paymentStatus: order.paymentStatus ?? "paid",
    });

    revalidatePath("/orders");
    await notifyOrdersChanged("order-created");

    return { ok: true };
  } catch (error) {
    console.error("[createOrder]", error);
    return { ok: false, error: "Sipariş kaydedilemedi" };
  }
}

// ─── Sipariş durumu güncelle ──────────────────────────────────────────────────
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  courier?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    // Teslim eden kuryeyi damgala: tek-kurye modunda sipariş üstlenilmediği için
    // courier boş kalıyordu → geçmişte "kim teslim etti" kaydı oluşmuyordu. İsim
    // geldiyse durum ile aynı atomik güncellemede yazılır. Çoklu modda zaten
    // üstlenen kurye = teslim eden olduğu için çelişmez (en fazla aynı ismi yazar).
    const stampCourier = courier?.trim();
    const update: Record<string, unknown> = { status };
    if (stampCourier) update.courier = stampCourier;

    // findOneAndUpdate güncelleme ÖNCESİ doc'u döner → createdAt ve önceki
    // deliveredAt elimizde olur (teslim süresini hesaplamak ve mükerrer
    // damgalamayı önlemek için).
    const doc = await OrderModel.findOneAndUpdate({ id }, update);
    if (!doc) return { ok: false, error: "Sipariş bulunamadı" };

    // Teslim süresi: sipariş İLK kez "delivered" olduğunda, alındığından
    // (createdAt) teslime kadar geçen toplam süreyi dakika olarak damgala.
    // Zaten damgalıysa dokunma (yanlışlıkla tekrar "delivered" seçilirse ilk
    // teslim süresi korunur).
    const prevDoc = doc as unknown as { createdAt?: Date; deliveredAt?: Date };
    if (status === "delivered" && !prevDoc.deliveredAt && prevDoc.createdAt) {
      const now = new Date();
      const durationMin = Math.max(
        0,
        Math.round((now.getTime() - prevDoc.createdAt.getTime()) / 60000),
      );
      await OrderModel.updateOne(
        { id },
        { $set: { deliveredAt: now, deliveryDurationMin: durationMin } },
      );
    }

    // Trendyol kaynaklıysa durum değişikliğini Trendyol'a da bildir (best-effort).
    // MOCK-DEV-* lokal simülatör siparişleridir; outbound atlanır.
    if (
      doc.source === "trendyol" &&
      doc.externalRef &&
      !doc.externalRef.startsWith("MOCK-DEV-")
    ) {
      await syncStatusToTrendyol(doc.externalRef, status);
    }

    await notifyOrdersChanged("status-changed");
    return { ok: true };
  } catch (error) {
    console.error("[updateOrderStatus]", error);
    return { ok: false, error: "Durum güncellenemedi" };
  }
}

// ─── Sipariş ödeme güncelle ───────────────────────────────────────────────────
export async function updateOrderPayment(
  id: string,
  payment: PaymentInfo,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    const doc = await OrderModel.findOneAndUpdate({ id }, { payment });
    if (!doc) return { ok: false, error: "Sipariş bulunamadı" };

    await notifyOrdersChanged("payment-changed");
    return { ok: true };
  } catch (error) {
    console.error("[updateOrderPayment]", error);
    return { ok: false, error: "Ödeme güncellenemedi" };
  }
}

// Sadece ödeme YÖNTEMİNİ güncelle (kurye kapıda gerçek yöntemi düzeltir).
// updateOrderPayment tüm payment objesini ezerdi; bu yalnızca method'u $set eder,
// cashGiven/change vb. korunur. Yöntem değiştirme kurye ekranında anlık çalışır.
export async function setOrderPaymentMethod(
  id: string,
  method: PaymentMethod,
  mealCardBrand?: MealCardBrand,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    // Yemek kartı: markayı da yaz (kurye kapıda hangi kart olduğunu seçer).
    // Diğer yöntemlerde marka anlamsız → varsa temizle ki eski marka takılı kalmasın.
    const update =
      method === "meal_card" && mealCardBrand
        ? {
            $set: {
              "payment.method": method,
              "payment.mealCardBrand": mealCardBrand,
            },
          }
        : {
            $set: { "payment.method": method },
            $unset: { "payment.mealCardBrand": "" },
          };

    const doc = await OrderModel.findOneAndUpdate({ id }, update);
    if (!doc) return { ok: false, error: "Sipariş bulunamadı" };

    await notifyOrdersChanged("payment-changed");
    return { ok: true };
  } catch (error) {
    console.error("[setOrderPaymentMethod]", error);
    return { ok: false, error: "Ödeme yöntemi güncellenemedi" };
  }
}

// ─── Tüm aktif sipariş sayısı (sidebar rozeti için, hafif sorgu) ────────────
export async function getActiveOrdersCount(): Promise<number> {
  try {
    await connectDB();
    return await OrderModel.countDocuments({
      status: { $in: ["pending", "preparing", "on-the-way"] },
    });
  } catch (error) {
    console.error("[getActiveOrdersCount]", error);
    return 0;
  }
}

// ─── Açık hesaplar (ödenmemiş siparişler) ───────────────────────────────────
// Ödenmemiş açık hesapların yanında BUGÜN tahsil edilenleri de döndürür; tahsil
// edilen kayıt listeden kaybolmasın, "Tahsil Edildi" olarak görünsün. paidAt
// yalnızca açık hesap tahsil edilince yazıldığından, peşin siparişleri kapsamaz.
export async function getOpenAccounts(): Promise<Order[]> {
  await connectDB();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // İptal edilen siparişler alacak sayılmaz — açık hesaplardan dışla.
  const docs = await OrderModel.find({
    status: { $ne: "cancelled" },
    $or: [
      { paymentStatus: "open" },
      { paymentStatus: "paid", paidAt: { $gte: startOfToday } },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();

  return docs.map((doc) => ({
    id: doc.id,
    orderNumber: doc.orderNumber,
    items: doc.items as Order["items"],
    customer: doc.customer as Order["customer"],
    payment: doc.payment as Order["payment"],
    status: doc.status as Order["status"],
    notes: doc.notes ?? undefined,
    subtotal: doc.subtotal,
    deliveryFee: doc.deliveryFee,
    total: doc.total,
    source: (doc.source as Order["source"]) ?? "manual",
    externalRef: doc.externalRef ?? undefined,
    paymentStatus: (doc.paymentStatus as Order["paymentStatus"]) ?? "paid",
    paidAt: (doc as unknown as { paidAt?: Date }).paidAt ?? undefined,
    ...ledgerFields(doc),
    createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
  }));
}

// Tek bir müşterinin (telefon) açık hesap özeti — yeni sipariş alınırken
// "bu müşterinin borcu var" uyarısı için. İptal edilenler dışlanır (helper'da).
export async function getCustomerOpenAccounts(
  phone: string,
): Promise<CustomerOpenAccounts | null> {
  const key = phone?.trim();
  if (!key || key.length < 6) return null;
  const map = await getOpenAccountsByPhone([key]);
  return map.get(key) ?? null;
}

// Açık hesap sayısı — sidebar rozeti için hafif sorgu.
export async function getOpenAccountsCount(): Promise<number> {
  try {
    await connectDB();
    return await OrderModel.countDocuments({
      paymentStatus: "open",
      status: { $ne: "cancelled" },
    });
  } catch (error) {
    console.error("[getOpenAccountsCount]", error);
    return 0;
  }
}

// Açık hesaba tahsilat işle. Kısmi olabilir: `amount` verilmezse kalanın tamamı
// tahsil edilir (eski "tümünü tahsil et" davranışı). Her tahsilat payments[]'a
// eklenir; toplam (paidAmount) sipariş tutarına ulaşınca paymentStatus "paid" olur,
// aksi halde sipariş "open" kalır ve kalan = total − paidAmount alacak olarak durur.
export async function collectOpenAccount(
  id: string,
  payment: PaymentInfo,
  amount?: number,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    const doc = await OrderModel.findOne({ id })
      .select("total paidAmount")
      .lean();
    if (!doc) return { ok: false, error: "Sipariş bulunamadı" };

    const total = (doc as unknown as { total: number }).total;
    const already = (doc as unknown as { paidAmount?: number }).paidAmount ?? 0;
    const remaining = Math.max(0, total - already);

    // Tutar verilmediyse kalanın tamamı; verilse de kalanı aşamaz, negatif olamaz.
    const pay =
      amount == null ? remaining : Math.min(Math.max(0, amount), remaining);
    if (pay <= 0) return { ok: false, error: "Geçersiz tahsilat tutarı" };

    const newPaid = already + pay;
    // Kuruş yuvarlamasına karşı küçük tolerans.
    const fullyPaid = newPaid >= total - 0.001;

    const record: PaymentRecord = {
      amount: pay,
      method: payment.method,
      mealCardBrand: payment.mealCardBrand,
      at: new Date(),
      note: note?.trim() || undefined,
    };

    // $set sözlüğü: her zaman paidAmount + tahsilat geçmişi; tamamlandıysa ek olarak
    // durum/yöntem/tarih. Tam ödemede payment'ı güncellemek mevcut davranışı korur.
    const set: Record<string, unknown> = { paidAmount: newPaid };
    if (fullyPaid) {
      set.paymentStatus = "paid";
      set.paidAt = new Date();
      set.payment = payment;
    }

    await OrderModel.updateOne(
      { id },
      { $push: { payments: record }, $set: set },
    );

    revalidatePath("/open-accounts");
    revalidatePath(`/orders/${id}`);
    await notifyOrdersChanged("payment-changed");
    return { ok: true };
  } catch (error) {
    console.error("[collectOpenAccount]", error);
    return { ok: false, error: "Tahsilat kaydedilemedi" };
  }
}

// Mevcut bir siparişi açık hesaba al / açık hesaptan çıkar (tahsilat durumunu değiştir).
export async function setOrderPaymentStatus(
  id: string,
  paymentStatus: "open" | "paid",
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    const update =
      paymentStatus === "paid"
        ? { paymentStatus, paidAt: new Date() }
        : { paymentStatus, paidAt: undefined };

    const doc = await OrderModel.findOneAndUpdate({ id }, update);
    if (!doc) return { ok: false, error: "Sipariş bulunamadı" };

    revalidatePath("/open-accounts");
    revalidatePath(`/orders/${id}`);
    await notifyOrdersChanged("payment-changed");
    return { ok: true };
  } catch (error) {
    console.error("[setOrderPaymentStatus]", error);
    return { ok: false, error: "Durum güncellenemedi" };
  }
}

// Bir siparişin müşterisinin (telefon) TÜM açık hesaplarını tek hareketle tahsil
// edilmiş say. Kurye kapıda yeni siparişi teslim ederken "eski borçları da aldım"
// derse çağrılır. Telefon, güvenlik için client'tan değil siparişten türetilir.
// Not: ödeme yöntemine dokunulmaz (kapıda genelde nakit toplanır); yalnızca durum
// "paid" yapılır ve paidAt yazılır. Kaç hesabın kapandığı döner.
export async function settleCustomerOpenAccounts(
  orderId: string,
): Promise<{ ok: boolean; error?: string; settled?: number }> {
  try {
    await connectDB();

    const order = await OrderModel.findOne({ id: orderId })
      .select("customer.phone")
      .lean();
    if (!order) return { ok: false, error: "Sipariş bulunamadı" };

    const phone = (order as unknown as { customer?: { phone?: string } }).customer
      ?.phone;
    if (!phone) return { ok: true, settled: 0 };

    const res = await OrderModel.updateMany(
      { "customer.phone": phone, paymentStatus: "open" },
      { paymentStatus: "paid", paidAt: new Date() },
    );

    revalidatePath("/open-accounts");
    revalidatePath("/orders");
    await notifyOrdersChanged("payment-changed");
    return { ok: true, settled: res.modifiedCount };
  } catch (error) {
    console.error("[settleCustomerOpenAccounts]", error);
    return { ok: false, error: "Açık hesaplar kapatılamadı" };
  }
}

// ─── Sipariş sil ─────────────────────────────────────────────────────────────
export async function deleteOrder(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();
    await OrderModel.findOneAndDelete({ id });
    return { ok: true };
  } catch (error) {
    console.error("[deleteOrder]", error);
    return { ok: false, error: "Sipariş silinemedi" };
  }
}
