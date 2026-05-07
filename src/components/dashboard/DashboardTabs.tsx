"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LayoutDashboard, ClipboardList, Receipt, UtensilsCrossed, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { tab: "overview", label: "Genel Bakış", icon: LayoutDashboard, color: "text-blue-600", border: "border-blue-500" },
  { tab: "orders", label: "Siparişler", icon: ClipboardList, color: "text-orange-600", border: "border-orange-500" },
  { tab: "payments", label: "Ödemeler", icon: Receipt, color: "text-emerald-600", border: "border-emerald-500" },
  { tab: "products", label: "Ürünler", icon: UtensilsCrossed, color: "text-amber-600", border: "border-amber-500" },
  { tab: "addresses", label: "Adresler", icon: MapPin, color: "text-rose-600", border: "border-rose-500" },
] as const;

export function DashboardTabs() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";

  return (
    <div className="shrink-0 bg-white border-b px-4 md:px-8 overflow-x-auto">
      <nav className="flex gap-1 min-w-max">
        {TABS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.tab;
          return (
            <Link
              key={item.tab}
              href={`/dashboard?tab=${item.tab}`}
              scroll={false}
              className={cn(
                "flex items-center gap-2 px-3 md:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                isActive
                  ? `${item.border} ${item.color}`
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
