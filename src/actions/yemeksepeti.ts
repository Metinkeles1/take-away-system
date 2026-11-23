"use server";

import { connectDB } from "@/lib/mongodb";
import YemeksepetiOrderModel from "@/models/YemeksepetiOrder";
import YemeksepetiCaptureModel from "@/models/YemeksepetiCapture";
import {
  isAutoDispatchEnabled,
  setAutoDispatchEnabled,
  listDispatchLogs,
  type DispatchLogRow,
} from "@/lib/yemeksepeti/dispatch";

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

// ─── Otomatik "yola çıktı" kayıtları (Ayarlar → Yemeksepeti Köprüsü) ─────────

export type { DispatchLogRow };

export async function getYemeksepetiDispatchState(): Promise<{
  enabled: boolean;
  logs: DispatchLogRow[];
}> {
  try {
    const [enabled, logs] = await Promise.all([isAutoDispatchEnabled(), listDispatchLogs(60)]);
    return { enabled, logs };
  } catch (err) {
    console.warn("[yemeksepeti dispatch logs]", err);
    return { enabled: true, logs: [] };
  }
}

export async function setYemeksepetiAutoDispatch(on: boolean): Promise<{ ok: boolean }> {
  try {
    await setAutoDispatchEnabled(on);
    return { ok: true };
  } catch (err) {
    console.error("[yemeksepeti auto dispatch]", err);
    return { ok: false };
  }
}
