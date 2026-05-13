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
    <>
      <style>{`
        @media screen {
          .voucher-print-wrapper {
            padding: 12px 0;
            background: #f5f5f5;
            min-height: 100vh;
            display: flex;
            justify-content: center;
          }
        }
        @media print {
          .voucher-print-wrapper {
            padding: 0 !important;
            background: #fff !important;
            min-height: 0 !important;
          }
        }
      `}</style>
      <div className="voucher-print-wrapper">
        <VoucherReceipt voucher={voucher} />
        <AutoPrint />
      </div>
    </>
  );
}
