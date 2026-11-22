"use server";

import { connectDB } from "@/lib/mongodb";
import YemeksepetiOrderModel from "@/models/YemeksepetiOrder";
import YemeksepetiCaptureModel from "@/models/YemeksepetiCapture";

export type YemeksepetiBridgeStatus = {
  configured: boolean; // sunucuda bağlantı anahtarı tanımlı mı
  orderCount: number;
  lastDataAt: string | null; // eklentiden en son veri ne zaman geldi
};

// Ayarlar kartı için: eklenti çalışıyor mu? Sadece okur.
export async function getYemeksepetiBridgeStatus(): Promise<YemeksepetiBridgeStatus> {
  const configured = !!process.env.YEMEKSEPETI_INGEST_TOKEN;
  try {
    await connectDB();
    const [orderCount, lastOrder, lastCapture] = await Promise.all([
      YemeksepetiOrderModel.estimatedDocumentCount(),
      YemeksepetiOrderModel.findOne({}, { lastSeenAt: 1 }).sort({ lastSeenAt: -1 }).lean(),
      YemeksepetiCaptureModel.findOne({}, { createdAt: 1 }).sort({ createdAt: -1 }).lean(),
    ]);
    const times = [lastOrder?.lastSeenAt, lastCapture?.createdAt]
      .filter((d): d is Date => d instanceof Date)
      .map((d) => d.getTime());
    return {
      configured,
      orderCount,
      lastDataAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    };
  } catch (err) {
    console.warn("[yemeksepeti status]", err);
    return { configured, orderCount: 0, lastDataAt: null };
  }
}
