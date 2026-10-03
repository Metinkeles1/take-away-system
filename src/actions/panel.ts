"use server";

import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import TrendyolOrderModel from "@/models/TrendyolOrder";
import { ensureTrendyolArchiveFresh } from "@/lib/trendyol/archive";
import { NON_REVENUE_STATUSES } from "@/lib/integrations/trendyol/packageUtils";
import { istanbulDayStart } from "@/lib/datetime";
import { getCourierCash, type CourierCashState } from "@/actions/courierCash";
import { getOpenAccountsSummary } from "@/actions/dashboardInsights";
import { getActiveCouriers } from "@/actions/couriers";
import { getDeliveryTargetMin } from "@/actions/settings";

// Panelin (ana sayfa) özet beslemesi. Panel dükkânda herkesin gördüğü ekranda
// açık durur → CİRO BİLEREK YOK (istemciye hiç gönderilmez). Yalnız operasyon:
// sipariş adedi, saatlik yoğunluk, teslim hızı, kuryedeki para, açık hesap.
// Hepsi Mongo'dan: kendi siparişlerimiz Order'dan, Trendyol arşivden
// (TrendyolOrder) — Trendyol'un para API'sine gidilmez, sık yenilenebilir.
export interface PanelSummary {
  own: number; // bugünkü sipariş (iptal hariç) — telefon/kendi kanallar
  trendyol: number;
  cancelled: number;
  yesterdaySoFar: number; // dün aynı saate kadar gelen sipariş (adil kıyas)
  hourly: { hour: number; own: number; trendyol: number }[]; // sipariş adedi
  deliveredToday: number; // bizim kuryelerin bugün teslim ettiği
  avgDeliveryMin: number | null;
  onTimeCount: number; // hedef süre içinde teslim edilen
  deliveryTargetMin: number;
  cash: CourierCashState;
  openAccounts: { total: number; count: number; customerCount: number };
  couriers: string[]; // aktif kurye adları
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export async function getPanelSummary(): Promise<PanelSummary> {
  // Arşiv tazeliği kendi içinde hız sınırlı; hata okumayı engellemez.
  await ensureTrendyolArchiveFresh().catch(() => {});
  await connectDB();

  const nowMs = Date.now();
  const todayStart = istanbulDayStart().getTime();
  const yStart = todayStart - DAY_MS;
  const ySoFar = new Date(nowMs - DAY_MS);

  const [ownDocs, tyDocs, ownYesterday, tyYesterday, ownDelivered, tyDelivered, cash, open, couriers, target] =
    await Promise.all([
      OrderModel.find({ source: { $ne: "trendyol" }, createdAt: { $gte: new Date(todayStart) } })
        .select({ createdAt: 1, status: 1 })
        .lean(),
      TrendyolOrderModel.find({ packageCreationDate: { $gte: new Date(todayStart) } })
        .select({ packageCreationDate: 1, packageStatus: 1 })
        .lean(),
      OrderModel.countDocuments({
        source: { $ne: "trendyol" },
        status: { $ne: "cancelled" },
        createdAt: { $gte: new Date(yStart), $lt: ySoFar },
      }),
      TrendyolOrderModel.countDocuments({
        packageStatus: { $nin: [...NON_REVENUE_STATUSES] },
        packageCreationDate: { $gte: new Date(yStart), $lt: ySoFar },
      }),
      OrderModel.find({
        source: { $ne: "trendyol" },
        status: "delivered",
        deliveredAt: { $gte: new Date(todayStart) },
        deliveryDurationMin: { $gt: 0 },
      })
        .select({ deliveryDurationMin: 1 })
        .lean(),
      // Yalnız bizim kuryenin taşıdığı (STORE) paketler — GO'yu Trendyol taşır.
      TrendyolOrderModel.find({
        deliveryType: "STORE",
        deliveredAt: { $gte: new Date(todayStart) },
        deliveryDurationMin: { $gt: 0 },
      })
        .select({ deliveryDurationMin: 1 })
        .lean(),
      getCourierCash(),
      getOpenAccountsSummary().catch(() => ({ totalOpen: 0, count: 0, customerCount: 0 })),
      getActiveCouriers(),
      getDeliveryTargetMin(),
    ]);

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, own: 0, trendyol: 0 }));
  const hourOf = (d: Date | string) => Math.min(23, Math.max(0, Math.floor((new Date(d).getTime() - todayStart) / HOUR_MS)));

  let own = 0;
  let cancelled = 0;
  for (const o of ownDocs) {
    if (o.status === "cancelled") {
      cancelled++;
      continue;
    }
    own++;
    hourly[hourOf((o as unknown as { createdAt: Date }).createdAt)].own++;
  }

  let trendyol = 0;
  for (const o of tyDocs) {
    if (NON_REVENUE_STATUSES.has(o.packageStatus ?? "")) {
      cancelled++;
      continue;
    }
    trendyol++;
    if (o.packageCreationDate) hourly[hourOf(o.packageCreationDate)].trendyol++;
  }

  const durations = [...ownDelivered, ...tyDelivered].map((d) => Number(d.deliveryDurationMin) || 0);
  const deliveredToday = durations.length;

  return {
    own,
    trendyol,
    cancelled,
    yesterdaySoFar: ownYesterday + tyYesterday,
    hourly,
    deliveredToday,
    avgDeliveryMin: deliveredToday ? Math.round(durations.reduce((s, m) => s + m, 0) / deliveredToday) : null,
    onTimeCount: durations.filter((m) => m <= target).length,
    deliveryTargetMin: target,
    cash,
    openAccounts: { total: open.totalOpen, count: open.count, customerCount: open.customerCount },
    couriers: couriers.map((c) => c.name),
  };
}
