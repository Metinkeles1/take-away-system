import { notFound, redirect } from "next/navigation";
import { getCorporateById } from "@/actions/corporate";
import NewVoucherClient from "./NewVoucherClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewVoucherPage({ params }: Props) {
  const { id } = await params;
  const corporate = await getCorporateById(id);
  if (!corporate) notFound();

  // Kişi başı tipinde basit dialog yeterli — detay sayfasında açılıyor
  if (corporate.billingType !== "per_item") {
    redirect(`/corporate/${id}`);
  }

  return <NewVoucherClient corporate={corporate} />;
}
