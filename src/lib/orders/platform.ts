// Pazaryeri (Trendyol / Yemeksepeti) siparişleri için ortak yardımcılar.
// Kurye ekranı ve panel, kaynağa göre doğru sunucu işlemini buradan seçer —
// her iki platformun işlemleri aynı imzaya sahip (ref = order.externalRef).

import {
  claimTrendyolPackage,
  unclaimTrendyolPackage,
  takeOverTrendyolPackage,
  claimManyTrendyolPackages,
  shipTrendyolCourierPackage,
  deliverTrendyolCourierPackage,
} from "@/actions/trendyolCourier";
import {
  claimYemeksepetiOrder,
  unclaimYemeksepetiOrder,
  takeOverYemeksepetiOrder,
  claimManyYemeksepetiOrders,
  shipYemeksepetiOrder,
  deliverYemeksepetiOrder,
} from "@/actions/yemeksepetiCourier";
import type { Order } from "@/types";

export type PlatformSource = "trendyol" | "yemeksepeti";

type Result = { ok: boolean; error?: string; takenBy?: string };

export interface PlatformOps {
  claim: (ref: string, courier: string) => Promise<Result>;
  unclaim: (ref: string, courier: string) => Promise<Result>;
  takeOver: (ref: string, courier: string, from: string) => Promise<Result>;
  claimMany: (refs: string[], courier: string) => Promise<{ ok: boolean; error?: string }>;
  ship: (ref: string, courier?: string) => Promise<Result>;
  deliver: (ref: string, courier?: string) => Promise<Result>;
}

const OPS: Record<PlatformSource, PlatformOps> = {
  trendyol: {
    claim: claimTrendyolPackage,
    unclaim: unclaimTrendyolPackage,
    takeOver: takeOverTrendyolPackage,
    claimMany: claimManyTrendyolPackages,
    ship: shipTrendyolCourierPackage,
    deliver: deliverTrendyolCourierPackage,
  },
  yemeksepeti: {
    claim: claimYemeksepetiOrder,
    unclaim: unclaimYemeksepetiOrder,
    takeOver: takeOverYemeksepetiOrder,
    claimMany: claimManyYemeksepetiOrders,
    ship: shipYemeksepetiOrder,
    deliver: deliverYemeksepetiOrder,
  },
};

export const PLATFORM_NAME: Record<PlatformSource, string> = {
  trendyol: "Trendyol",
  yemeksepeti: "Yemeksepeti",
};

// Pazaryeri siparişi mi? (ödeme platformda belirlenir, pin/açık hesap yok,
// "Yola çıktım" adımı var.)
export function isPlatformOrder(o: Pick<Order, "source">): o is Order & { source: PlatformSource } {
  return o.source === "trendyol" || o.source === "yemeksepeti";
}

export function platformOps(o: Order): PlatformOps | null {
  return isPlatformOrder(o) ? OPS[o.source] : null;
}

// Toplu üstlenme: kendi siparişler (doc id) + her platformun ref listesi.
export function splitByPlatform(orders: Order[]): {
  own: string[];
  platform: { ops: PlatformOps; refs: string[] }[];
} {
  const own: string[] = [];
  const refs: Record<PlatformSource, string[]> = { trendyol: [], yemeksepeti: [] };
  for (const o of orders) {
    if (isPlatformOrder(o)) {
      if (o.externalRef) refs[o.source].push(o.externalRef);
    } else own.push(o.id);
  }
  return {
    own,
    platform: (Object.keys(refs) as PlatformSource[])
      .filter((k) => refs[k].length > 0)
      .map((k) => ({ ops: OPS[k], refs: refs[k] })),
  };
}
