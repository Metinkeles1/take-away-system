"use client";

import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Printer,
  Pencil,
  Clock,
  ClipboardList,
  CheckCircle2,
  Bike,
  XCircle,
  Wallet,
  Receipt,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types";
import { memo, useState } from "react";
import { toast } from "sonner";

const iconMap: Record<OrderStatus, React.ElementType> = {
  pending: Clock,
  preparing: ClipboardList,
  "on-the-way": Bike,
  delivered: CheckCircle2,
  cancelled: XCircle,
};

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string }
> = {
  pending: {
    label: "Beklemede",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
  },
  preparing: {
    label: "Hazırlanıyor",
    color: "bg-blue-100 text-blue-800 border-blue-300",
  },
  "on-the-way": {
    label: "Yolda",
    color: "bg-purple-100 text-purple-800 border-purple-300",
  },
  delivered: {
    label: "Teslim Edildi",
    color: "bg-green-100 text-green-800 border-green-300",
  },
  cancelled: {
    label: "İptal Edildi",
    color: "bg-red-100 text-red-800 border-red-300",
  },
};

interface Props {
  order: Order;
  onPrint: () => void;
  onToggleOpen: (open: boolean) => Promise<void>;
  showReceipt?: boolean;
  onToggleReceipt?: () => void;
}

const OrderDetailHeader = memo(function OrderDetailHeader({
  order,
  onPrint,
  onToggleOpen,
  showReceipt,
  onToggleReceipt,
}: Props) {
  const router = useRouter();
  const config = statusConfig[order.status];
  const Icon = iconMap[order.status];
  const [marking, setMarking] = useState(false);

  const isManual = !order.source || order.source === "manual";
  const canMarkOpen = isManual && order.paymentStatus !== "open";

  const handleMarkOpen = async () => {
    setMarking(true);
    try {
      await onToggleOpen(true);
      toast.success("Açık hesaba alındı");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="mb-4 flex items-center gap-3 shrink-0">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Geri
      </Button>
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Sipariş #{order.orderNumber}</h1>
          <span
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${config.color}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {config.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {formatDate(order.createdAt)}
        </p>
      </div>
      {isManual && (
        <Button variant="outline" asChild>
          <Link href={`/orders/${order.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Düzenle
          </Link>
        </Button>
      )}
      {canMarkOpen && (
        <Button
          variant="outline"
          onClick={handleMarkOpen}
          disabled={marking}
          className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-400"
        >
          <Wallet className="mr-2 h-4 w-4" />
          {marking ? "İşleniyor..." : "Açık Hesaba Al"}
        </Button>
      )}
      {onToggleReceipt && (
        <Button
          variant="outline"
          onClick={onToggleReceipt}
          className="hidden lg:inline-flex"
        >
          <Receipt className="mr-2 h-4 w-4" />
          {showReceipt ? "Fişi Gizle" : "Fiş Önizle"}
        </Button>
      )}
      <Button variant="outline" onClick={onPrint}>
        <Printer className="mr-2 h-4 w-4" />
        Fişi Yazdır
      </Button>
    </div>
  );
});

export default OrderDetailHeader;
