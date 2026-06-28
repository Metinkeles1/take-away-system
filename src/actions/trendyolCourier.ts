"use server";

import {
  listTrendyolPackages,
  deliverTrendyolPackage,
} from "@/lib/integrations/trendyol/client";
import { mapTrendyolPackageToOrder } from "@/lib/integrations/trendyol/courierMap";
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

// Kurye sayfası için Trendyol teslim siparişlerini ÇEKER (tek seferlik, butona
// basınca). Sürekli polling YOK — istek tüketmemek için yalnızca kurye isteyince.
//
// Yalnızca SENİN taşıdığın paketler (deliveryType "STORE") rota/teslim için
// anlamlı; Model 2 ("GO") siparişlerini Trendyol'un kendi kuryesi taşır ve adres
// "Trendyol Yemek" placeholder'ı döner (koordinat yok) → hariç tutulur.
// Statü: Picking (kabul edildi) + Invoiced (hazır) = yola çıkacak/çıkmış paketler.
export async function getTrendyolCourierPackages(): Promise<{
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
      packageStatuses: "Picking,Invoiced",
      size: 50,
    });
    if (!res.ok) {
      return { ok: false, orders: [], configured: true, error: res.error };
    }
    const orders = res.data.content
      .filter((p) => p.deliveryType === "STORE")
      .map(mapTrendyolPackageToOrder);
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
export async function deliverTrendyolCourierPackage(
  packageId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await deliverTrendyolPackage(packageId);
    if (!res.ok) {
      return { ok: false, error: res.error || "Trendyol teslim güncellenemedi" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Trendyol teslim güncellenemedi",
    };
  }
}
