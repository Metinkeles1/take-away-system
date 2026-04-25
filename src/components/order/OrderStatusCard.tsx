"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  ClipboardList,
  CheckCircle2,
  Bike,
  XCircle,
} from "lucide-react";
import type { OrderStatus } from "@/types";
import { memo, useCallback } from "react";
import { toast } from "sonner";

interface Props {
  status: OrderStatus;
  onStatusChange: (status: OrderStatus) => void;
}

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: "Beklemede",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    icon: Clock,
  },
  preparing: {
    label: "Hazırlanıyor",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    icon: ClipboardList,
  },
  "on-the-way": {
    label: "Yolda",
    color: "bg-purple-100 text-purple-800 border-purple-300",
    icon: Bike,
  },
  delivered: {
    label: "Teslim Edildi",
    color: "bg-green-100 text-green-800 border-green-300",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "İptal Edildi",
    color: "bg-red-100 text-red-800 border-red-300",
    icon: XCircle,
  },
};

const statusOrder: OrderStatus[] = [
  "pending",
  "preparing",
  "on-the-way",
  "delivered",
  "cancelled",
];

const OrderStatusCard = memo(function OrderStatusCard({
  status,
  onStatusChange,
}: Props) {
  const handleChange = useCallback(
    (val: string) => {
      const newStatus = val as OrderStatus;
      onStatusChange(newStatus);
      toast.success("Durum güncellendi");
    },
    [onStatusChange]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sipariş Durumu</CardTitle>
      </CardHeader>
      <CardContent>
        <Select value={status} onValueChange={handleChange}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOrder.map((s) => {
              const c = statusConfig[s];
              const SIcon = c.icon;
              return (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <SIcon className="h-4 w-4" />
                    {c.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
});

export default OrderStatusCard;
