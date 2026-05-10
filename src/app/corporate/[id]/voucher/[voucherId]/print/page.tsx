import { notFound } from "next/navigation";
import { getCorporateById } from "@/actions/corporate";
import { getVoucherById } from "@/actions/vouchers";
import VoucherReceipt from "@/components/receipt/VoucherReceipt";
import AutoPrint from "@/components/receipt/AutoPrint";

interface Props {
  params: Promise<{ id: string; voucherId: string }>;
}

export default async function VoucherPrintPage({ params }: Props) {
  const { id, voucherId } = await params;

  const [corporate, voucher] = await Promise.all([
    getCorporateById(id),
    getVoucherById(voucherId),
  ]);

  if (!corporate || !voucher || voucher.corporateId !== id) notFound();

  return (
    <div style={{ padding: "12px 0", background: "#f5f5f5", minHeight: "100vh" }}>
      <VoucherReceipt voucher={voucher} />
      <AutoPrint />
    </div>
  );
}
