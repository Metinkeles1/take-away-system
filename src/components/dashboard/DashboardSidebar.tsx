"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Home,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ClipboardList,
  Receipt,
  UtensilsCrossed,
  MapPin,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { tab: "overview", label: "Genel Bakış", icon: LayoutDashboard, color: "text-blue-400", activeBg: "bg-blue-500/15" },
  { tab: "orders", label: "Siparişler", icon: ClipboardList, color: "text-orange-400", activeBg: "bg-orange-500/15" },
  { tab: "payments", label: "Ödemeler", icon: Receipt, color: "text-emerald-400", activeBg: "bg-emerald-500/15" },
  { tab: "products", label: "Ürünler & Kategoriler", icon: UtensilsCrossed, color: "text-amber-400", activeBg: "bg-amber-500/15" },
  { tab: "addresses", label: "Adresler & Menüler", icon: MapPin, color: "text-rose-400", activeBg: "bg-rose-500/15" },
];

export default function DashboardSidebar() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "h-full flex flex-col bg-slate-900 text-white transition-all duration-300 shrink-0",
        collapsed ? "w-17" : "w-56"
      )}
    >
      {/* Brand */}
      <div className="shrink-0 px-4 h-14 flex items-center gap-2.5 border-b border-white/10">
        <div className="h-8 w-8 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
          <BarChart3 className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-sm font-bold tracking-tight whitespace-nowrap overflow-hidden">
            Dashboard
          </span>
        )}
      </div>

      {/* Section Nav */}
      <nav className="flex-1 py-4 overflow-y-auto px-2">
        {!collapsed && (
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Bölümler
          </p>
        )}
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.tab;
            return (
              <Link
                key={item.tab}
                href={`/dashboard?tab=${item.tab}`}
                scroll={false}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  collapsed && "justify-center px-0",
                  isActive
                    ? `${item.activeBg} text-white shadow-sm shadow-black/10`
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                )}
              >
                <Icon className={cn("h-4.5 w-4.5 shrink-0", isActive && item.color)} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {isActive && !collapsed && (
                  <div className={cn("ml-auto h-1.5 w-1.5 rounded-full", item.color.replace("text-", "bg-"))} />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Ana Sayfaya Dön */}
      <div className="px-2 pb-2">
        <Link
          href="/"
          title={collapsed ? "Ana Sayfaya Dön" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
            "text-slate-400 hover:bg-white/10 hover:text-white",
            collapsed && "justify-center px-0"
          )}
        >
          <Home className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && <span className="truncate">Ana Sayfaya Dön</span>}
        </Link>
      </div>

      {/* Collapse Toggle */}
      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Daralt</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
