// Source adapter sözleşmesi. Her kaynak (manuel DB, Trendyol API, Getir, ...)
// bu interface'i implemente eder.

import type { DashboardViewModel } from "../types";

// Standart period anahtarı. Bütün kaynakların bunu desteklemesi şart değil;
// `supportedPeriods` ile hangilerinin geçerli olduğunu bildirirler.
export type DashboardPeriod = "today" | "7d" | "30d" | "month";

export interface DashboardSourceAdapter {
  key: string;                                // "manual" | "trendyol" | ...
  label: string;
  supportedPeriods: DashboardPeriod[];
  defaultPeriod: DashboardPeriod;
  load: (period: DashboardPeriod) => Promise<DashboardViewModel>;
}
