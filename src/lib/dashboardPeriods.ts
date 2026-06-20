// Dashboard dönem pencereleri — hem overview hem insights action'ları kullanır.
// "use server" dosyasından sync fonksiyon export edilemediği için burada.

import { istanbulDayStart } from "@/lib/datetime";

export type DashboardPeriod = "day" | "week" | "month";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface PeriodWindow {
  start: number;
  end: number;
  prevStart: number;
  prevEnd: number;
  buckets: "hour" | "day";
  days: number;
}

// offset = kaç dönem geriye (0=güncel, 1=bir önceki …); gün/hafta/ay için aynı.
export function periodWindows(
  period: DashboardPeriod,
  offset: number,
): PeriodWindow {
  const todayStart = istanbulDayStart().getTime();
  const now = Date.now();
  const off = Math.max(0, Math.min(365, Math.floor(offset)));

  if (period === "day") {
    const start = todayStart - off * DAY_MS;
    const end = off === 0 ? now : start + DAY_MS;
    return {
      start,
      end,
      prevStart: start - DAY_MS,
      prevEnd: start,
      buckets: "hour",
      days: 1,
    };
  }
  const span = period === "week" ? 7 : 30;
  const currentStart = todayStart - (span - 1) * DAY_MS;
  const start = currentStart - off * span * DAY_MS;
  const end = off === 0 ? now : start + span * DAY_MS;
  return {
    start,
    end,
    prevStart: start - span * DAY_MS,
    prevEnd: start,
    buckets: "day",
    days: span,
  };
}
