import { notFound } from "next/navigation";
import { getCorporateById } from "@/actions/corporate";
import { getVouchersByCorporate, getPeriodStats } from "@/actions/vouchers";
import { currentPeriod } from "@/lib/period";
import MonthlyStatement from "@/components/receipt/MonthlyStatement";
import AutoPrint from "@/components/receipt/AutoPrint";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;

export default async function StatementPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;

  const corporate = await getCorporateById(id);
  if (!corporate) notFound();

  const period =
    sp.period && PERIOD_PATTERN.test(sp.period) ? sp.period : currentPeriod();

  const [vouchers, stats] = await Promise.all([
    getVouchersByCorporate(id, { period }),
    getPeriodStats(id, period),
  ]);

  return (
    <div style={{ padding: "12px 0", background: "#f5f5f5", minHeight: "100vh" }}>
      <MonthlyStatement
        corporate={corporate}
        vouchers={vouchers}
        stats={stats}
        period={period}
      />
      <AutoPrint />
    </div>
  );
}
