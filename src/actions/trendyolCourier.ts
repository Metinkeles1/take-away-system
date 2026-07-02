"use server";

import {
  listTrendyolPackages,
  deliverTrendyolPackage,
  markTrendyolPackageInvoiced,
  shipTrendyolPackage,
} from "@/lib/integrations/trendyol/client";
import { mapTrendyolPackageToOrder } from "@/lib/integrations/trendyol/courierMap";
import { connectDB } from "@/lib/mongodb";
import TrendyolCourierPackageModel from "@/models/TrendyolCourierPackage";
import { notifyOrdersChanged } from "@/lib/pusher/server";
import type { Order } from "@/types";

// Trendyol entegrasyonu env'i tanımlı mı? Tanımlı değilse özellik sessizce devre
// dışı kalır (kurye kendi siparişleriyle çalışmaya devam eder, hata gösterilmez).
function trendyolConfigured(): boolean {
  return Boolean(
    process.env.TRENDYOL_SUPPLIER_ID &&
      (process.env.TRENDYOL_API_TOKEN ||
        (process.env.TRENDYOL_API_KEY && process.env.TRENDYOL_API_SECRET)),
  );
}

// Paylaşımlı depodaki Trendyol siparişleri — API'ye DOKUNMAZ, sadece Mongo okur.
// getCourierBoard bunu her poll'da çağırır (ucuz sorgu); böylece tüm kuryeler
// aynı listeyi görür, kimse ayrıca "çek"e basmak zorunda kalmaz.
export async function getStoredTrendyolCourierOrders(): Promise<Order[]> {
  if (!trendyolConfigured()) return [];
  try {
    await connectDB();
    const docs = await TrendyolCourierPackageModel.find()
      .sort({ createdAt: 1 })
      .lean();
    // courier alanı doc'ta ayrı tutulur (sync order'ı ezer, courier'a dokunmaz) →
    // okurken order'a iliştir. status ise order içinde (courierMap'ten) gelir.
    return docs.map((d) => ({
      ...(d.order as Order),
      courier: d.courier ?? undefined,
    }));
  } catch (err) {
    console.warn("[trendyol stored read]", err);
    return [];
  }
}

// Trendyol'dan TAZE çeker → paylaşımlı depoyu günceller → Pusher ile herkese yayar.
// Yalnızca "çek"e basınca (veya elle yenileyince) çalışır; sürekli polling YOK →
// API tüketimi düşük kalır. Yayın sayesinde tüm kurye ekranları anında güncellenir.
//
// Yalnızca SENİN taşıdığın paketler (deliveryType "STORE") rota/teslim için
// anlamlı; Model 2 ("GO") siparişlerini Trendyol'un kendi kuryesi taşır.
// Statü: Picking (kabul) + Invoiced (hazır) + Shipped (yola çıktı, teslim olmadı)
// = kuryenin elindeki, henüz teslim edilmemiş paketler.
export async function syncTrendyolCourierPackages(): Promise<{
  ok: boolean;
  orders: Order[];
  configured: boolean;
  error?: string;
}> {
  if (!trendyolConfigured()) {
    return { ok: true, orders: [], configured: false };
  }

  try {
    const res = await listTrendyolPackages({
      packageStatuses: "Picking,Invoiced,Shipped",
      size: 50,
    });
    if (!res.ok) {
      return { ok: false, orders: [], configured: true, error: res.error };
    }

    const orders = res.data.content
      .filter((p) => p.deliveryType === "STORE")
      .map(mapTrendyolPackageToOrder);

    // Paylaşımlı depoyu aktif setle senkronla: aktifleri upsert et, artık aktif
    // olmayanları (teslim/iptal edildi ya da listeden düştü) sil.
    await connectDB();
    const now = new Date();
    const activeIds = orders
      .map((o) => o.externalRef)
      .filter((id): id is string => Boolean(id));

    if (orders.length > 0) {
      await TrendyolCourierPackageModel.bulkWrite(
        orders.map((o) => ({
          updateOne: {
            filter: { packageId: o.externalRef },
            update: { $set: { order: o, syncedAt: now } },
            upsert: true,
          },
        })),
      );
    }
    // activeIds boşsa $nin [] her şeyi eşler → depo temizlenir (doğru davranış).
    await TrendyolCourierPackageModel.deleteMany({
      packageId: { $nin: activeIds },
    });

    await notifyOrdersChanged("trendyol-courier-sync");
    return { ok: true, orders, configured: true };
  } catch (err) {
    return {
      ok: false,
      orders: [],
      configured: true,
      error:
        err instanceof Error ? err.message : "Trendyol siparişleri alınamadı",
    };
  }
}

// Trendyol siparişini teslim işaretler (manual-delivered). Kurye kartındaki
// "Teslim" bu siparişler için DB yerine bunu çağırır. packageId = order.externalRef.
// Başarılıysa paylaşımlı depodan da siler + Pusher ile diğer kuryelerden düşürür.
export async function deliverTrendyolCourierPackage(
  packageId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await deliverTrendyolPackage(packageId);
    if (!res.ok) {
      return { ok: false, error: res.error || "Trendyol teslim güncellenemedi" };
    }
    // Teslim başarılı: paylaşımlı depodan düşür ve tüm ekranlara yay. Bu adımın
    // hatası teslimi geçersiz kılmaz (asıl gerçek Trendyol'da işlendi).
    try {
      await connectDB();
      await TrendyolCourierPackageModel.deleteOne({ packageId });
      await notifyOrdersChanged("trendyol-courier-delivered");
    } catch (cleanupErr) {
      console.warn("[trendyol delivered cleanup]", cleanupErr);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Trendyol teslim güncellenemedi",
    };
  }
}

// Kurye Trendyol paketini üstlenir (multi-kurye modu). Yarış: yalnızca boşsa ya
// da zaten aynı kuryedeyse yazar; başkası almışsa kim aldığı döner (UI kilitler).
// Kendi siparişlerdeki claimOrder ile aynı mantık, ayrı koleksiyon.
export async function claimTrendyolPackage(
  packageId: string,
  courier: string,
): Promise<{ ok: boolean; error?: string; takenBy?: string }> {
  try {
    const name = courier.trim();
    if (!name) return { ok: false, error: "Kurye adı gerekli" };
    await connectDB();

    const doc = await TrendyolCourierPackageModel.findOneAndUpdate(
      {
        packageId,
        $or: [{ courier: { $exists: false } }, { courier: null }, { courier: name }],
      },
      { $set: { courier: name } },
      { new: true },
    ).lean();

    if (!doc) {
      const current = await TrendyolCourierPackageModel.findOne({ packageId })
        .select("courier")
        .lean();
      const takenBy = (current as { courier?: string } | null)?.courier;
      return {
        ok: false,
        error: takenBy ? `${takenBy} bu paketi aldı` : "Paket bulunamadı",
        takenBy: takenBy ?? undefined,
      };
    }

    await notifyOrdersChanged("trendyol-courier-claimed");
    return { ok: true };
  } catch (err) {
    console.error("[claimTrendyolPackage]", err);
    return { ok: false, error: "Paket alınamadı" };
  }
}

// Kurye üstlenmeyi bırakır → paket havuza döner. Yalnızca alan kurye bırakabilir.
export async function unclaimTrendyolPackage(
  packageId: string,
  courier: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const name = courier.trim();
    await connectDB();
    const doc = await TrendyolCourierPackageModel.findOneAndUpdate(
      { packageId, courier: name },
      { $unset: { courier: "" } },
    );
    if (!doc) return { ok: false, error: "Bu paketi sen almamışsın" };
    await notifyOrdersChanged("trendyol-courier-unclaimed");
    return { ok: true };
  } catch (err) {
    console.error("[unclaimTrendyolPackage]", err);
    return { ok: false, error: "Paket bırakılamadı" };
  }
}

// Birden çok boş Trendyol paketini tek hamlede üstlen (Hepsini Al / haritadan).
// Yalnızca hâlâ boş olanlar yazılır (arada başkası kapmışsa atlanır).
export async function claimManyTrendyolPackages(
  packageIds: string[],
  courier: string,
): Promise<{ ok: boolean; error?: string; claimed?: number }> {
  try {
    const name = courier.trim();
    if (!name || packageIds.length === 0) return { ok: true, claimed: 0 };
    await connectDB();
    const res = await TrendyolCourierPackageModel.updateMany(
      {
        packageId: { $in: packageIds },
        $or: [{ courier: { $exists: false } }, { courier: null }],
      },
      { $set: { courier: name } },
    );
    if (res.modifiedCount > 0) {
      await notifyOrdersChanged("trendyol-courier-claimed-bulk");
    }
    return { ok: true, claimed: res.modifiedCount };
  } catch (err) {
    console.error("[claimManyTrendyolPackages]", err);
    return { ok: false, error: "Paketler alınamadı" };
  }
}

// "Yola çıktım": paketi invoiced (hazır) + manual-shipped (yola çıktı) yapar.
// Trendyol akışı manual-shipped için önce invoiced şart koşar; invoiced zaten
// yapılmışsa hata bloklamaz (sadece loglanır). Başarılıysa cache'teki order.status
// "on-the-way"e çekilir + Pusher → kartta "Teslim" adımı açılır.
export async function shipTrendyolCourierPackage(
  packageId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const inv = await markTrendyolPackageInvoiced(packageId);
    if (!inv.ok) console.warn("[trendyol invoiced]", inv.status, inv.error);
    const ship = await shipTrendyolPackage(packageId);
    if (!ship.ok) {
      return { ok: false, error: ship.error || "Yola çıkış güncellenemedi" };
    }
    try {
      await connectDB();
      await TrendyolCourierPackageModel.updateOne(
        { packageId },
        { $set: { "order.status": "on-the-way" } },
      );
      await notifyOrdersChanged("trendyol-courier-shipped");
    } catch (cleanupErr) {
      console.warn("[trendyol ship cache]", cleanupErr);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Yola çıkış güncellenemedi",
    };
  }
}
