import {
  Clock,
  ClipboardList,
  CheckCircle2,
  Bike,
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
  Building,
} from "lucide-react";
import { type Order } from "@/types";

export const statusConfig: Record<
  Order["status"],
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  pending: {
    label: "Beklemede",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    icon: Clock,
  },
  preparing: {
    label: "Hazırlanıyor",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    icon: ClipboardList,
  },
  "on-the-way": {
    label: "Yolda",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200",
    icon: Bike,
  },
  delivered: {
    label: "Teslim Edildi",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "İptal",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    icon: ClipboardList,
  },
};

export const PAYMENT_LABELS: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  cash: { label: "Nakit", icon: Banknote, color: "text-emerald-700", bg: "bg-emerald-100" },
  card: { label: "Kredi Kartı", icon: CreditCard, color: "text-blue-700", bg: "bg-blue-100" },
  online: { label: "Online", icon: Smartphone, color: "text-violet-700", bg: "bg-violet-100" },
  meal_card: { label: "Yemek Kartı", icon: Wallet, color: "text-orange-700", bg: "bg-orange-100" },
  iban: { label: "IBAN/Havale", icon: Building, color: "text-cyan-700", bg: "bg-cyan-100" },
};

export const CATEGORY_COLORS: Record<string, { from: string; to: string; text: string; bg: string }> = {
  kebap: { from: "from-red-500", to: "to-orange-500", text: "text-red-700", bg: "bg-red-100" },
  pide: { from: "from-amber-500", to: "to-yellow-500", text: "text-amber-700", bg: "bg-amber-100" },
  lahmacun: { from: "from-orange-500", to: "to-red-500", text: "text-orange-700", bg: "bg-orange-100" },
  durum: { from: "from-emerald-500", to: "to-green-500", text: "text-emerald-700", bg: "bg-emerald-100" },
  kilo: { from: "from-blue-500", to: "to-indigo-500", text: "text-blue-700", bg: "bg-blue-100" },
  corba: { from: "from-yellow-500", to: "to-amber-500", text: "text-yellow-700", bg: "bg-yellow-100" },
  tatli: { from: "from-pink-500", to: "to-rose-500", text: "text-pink-700", bg: "bg-pink-100" },
  icecek: { from: "from-cyan-500", to: "to-teal-500", text: "text-cyan-700", bg: "bg-cyan-100" },
};

export const DONUT_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  preparing: "#3b82f6",
  "on-the-way": "#8b5cf6",
  delivered: "#10b981",
  cancelled: "#ef4444",
};
