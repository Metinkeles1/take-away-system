import { notFound } from "next/navigation";
import { getCorporateById } from "@/actions/corporate";
import {
  getAvailablePeriods,
  getPeriodStats,
  getVouchersByCorporate,
} from "@/actions/vouchers";
import { currentPeriod } from "@/lib/period";
import CorporateDetailClient from "./CorporateDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CorporateDetailPage({ params }: Props) {
  const { id } = await params;
  const initialPeriod = currentPeriod();

  // 4 bağımsız sorgu paralel: corporate, periods, vouchers, stats.
  // Hepsi server'da tamamlandığı için client mount olduğunda ilk veri zaten
  // elde — eski "loading.tsx → ikinci client skeleton → veri" akışındaki
  // çift geçişi atlıyoruz.
  const [corporate, periods, vouchers, stats] = await Promise.all([
    getCorporateById(id),
    getAvailablePeriods(id),
    getVouchersByCorporate(id, { period: initialPeriod }),
    getPeriodStats(id, initialPeriod),
  ]);
  if (!corporate) notFound();

  const periodList = periods.includes(initialPeriod)
    ? periods
    : [initialPeriod, ...periods];

  return (
    <CorporateDetailClient
      corporate={corporate}
      initialPeriod={initialPeriod}
      availablePeriods={periodList}
      initialVouchers={vouchers}
      initialStats={stats}
    />
  );
}
