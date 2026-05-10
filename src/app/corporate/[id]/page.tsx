import { notFound } from "next/navigation";
import { getCorporateById } from "@/actions/corporate";
import { getAvailablePeriods } from "@/actions/vouchers";
import { currentPeriod } from "@/lib/period";
import CorporateDetailClient from "./CorporateDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CorporateDetailPage({ params }: Props) {
  const { id } = await params;
  const corporate = await getCorporateById(id);
  if (!corporate) notFound();

  const periods = await getAvailablePeriods(id);
  const initialPeriod = currentPeriod();
  const periodList = periods.includes(initialPeriod)
    ? periods
    : [initialPeriod, ...periods];

  return (
    <CorporateDetailClient
      corporate={corporate}
      initialPeriod={initialPeriod}
      availablePeriods={periodList}
    />
  );
}
