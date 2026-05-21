import { notFound, redirect } from "next/navigation";
import { getOrderById } from "@/actions/orders";
import { OrderEditor } from "@/components/orders/create";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditOrderPage({ params }: Props) {
  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) notFound();

  // Yalnızca manuel siparişler düzenlenebilir — pazaryeri kalemlerine dokunma.
  if (order.source && order.source !== "manual") {
    redirect(`/orders/${id}`);
  }

  return <OrderEditor mode="edit" initialOrder={order} />;
}
