import {
  Clock,
  ClipboardList,
  CheckCircle2,
  Bike,
  XCircle,
} from "lucide-react";
import { type OrderStatus } from "@/types";

export interface OrderStatusConfig {
  label: string;
  color: string;
  accent: string;
  icon: React.ElementType;
}

export const ORDER_STATUS_CONFIG: Record<OrderStatus, OrderStatusConfig> = {
  pending: {
    label: "Beklemede",
    color: "bg-yellow-100 text-yellow-800",
    accent: "bg-yellow-400",
    icon: Clock,
  },
  preparing: {
    label: "Hazırlanıyor",
    color: "bg-blue-100 text-blue-800",
    accent: "bg-blue-500",
    icon: ClipboardList,
  },
  "on-the-way": {
    label: "Yolda",
    color: "bg-purple-100 text-purple-800",
    accent: "bg-purple-500",
    icon: Bike,
  },
  delivered: {
    label: "Teslim Edildi",
    color: "bg-green-100 text-green-800",
    accent: "bg-green-500",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "İptal",
    color: "bg-red-100 text-red-800",
    accent: "bg-red-400",
    icon: XCircle,
  },
};

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  "pending",
  "preparing",
  "on-the-way",
  "delivered",
  "cancelled",
];
