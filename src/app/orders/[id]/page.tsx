import { notFound } from "next/navigation";
import { getOrderById } from "@/actions/orders";
import OrderDetailClient from "./OrderDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) notFound();

  return <OrderDetailClient initialOrder={order} />;
}
