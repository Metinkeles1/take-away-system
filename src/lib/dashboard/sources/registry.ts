import type { DashboardSource } from "@/actions/dashboard";
import { createManualAdapter } from "./manual";
import { trendyolAdapter } from "./trendyol";
import type { DashboardSourceAdapter } from "./types";

// Aktif adapter kayıt defteri. Yeni kaynak eklenince buraya bir satır.
export const ADAPTERS = {
  all: createManualAdapter("all"),
  manual: createManualAdapter("manual"),
  trendyol: trendyolAdapter,
  // Getir/Yemeksepeti için manuel DB üzerinden:
  getir: createManualAdapter("getir"),
  yemeksepeti: createManualAdapter("yemeksepeti"),
} as const satisfies Record<DashboardSource, DashboardSourceAdapter>;

export type AdapterKey = keyof typeof ADAPTERS;

export function getAdapter(key: AdapterKey): DashboardSourceAdapter {
  return ADAPTERS[key];
}
