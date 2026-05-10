import { notFound, redirect } from "next/navigation";
import { getCorporateById } from "@/actions/corporate";
import { getVoucherById } from "@/actions/vouchers";
import NewVoucherClient from "../../new/NewVoucherClient";

interface Props {
  params: Promise<{ id: string; voucherId: string }>;
}

export default async function EditVoucherPage({ params }: Props) {
  const { id, voucherId } = await params;

  const [corporate, voucher] = await Promise.all([
    getCorporateById(id),
    getVoucherById(voucherId),
  ]);

  if (!corporate || !voucher) notFound();
  if (voucher.corporateId !== corporate.id) notFound();

  if (voucher.paid) redirect(`/corporate/${id}`);
  if (voucher.billingType !== "per_item") redirect(`/corporate/${id}`);

  return <NewVoucherClient corporate={corporate} voucher={voucher} />;
}
