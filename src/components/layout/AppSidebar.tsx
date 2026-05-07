"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  BarChart3,
  ShoppingBag,
  ClipboardList,
  Users,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Panel", icon: Home, color: "text-slate-300" },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, color: "text-blue-400", activeBg: "bg-blue-500/15" },
  { href: "/orders/new", label: "Yeni Sipariş", icon: ShoppingBag, color: "text-orange-400", activeBg: "bg-orange-500/15" },
  { href: "/orders", label: "Siparişler", icon: ClipboardList, color: "text-emerald-400", activeBg: "bg-emerald-500/15" },
  { href: "/customers", label: "Müşteriler", icon: Users, color: "text-pink-400", activeBg: "bg-pink-500/15" },
  { href: "/products", label: "Menü", icon: UtensilsCrossed, color: "text-amber-400", activeBg: "bg-amber-500/15" },
] as const;

function isItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/orders") {
    return pathname === "/orders" || (pathname.startsWith("/orders") && !pathname.startsWith("/orders/new"));
  }
  return pathname.startsWith(href);
}

type Props = {
  /** Mobil Sheet içinde render edilirken collapsible olmasın */
  variant?: "desktop" | "mobile";
  /** Mobilde linke tıklayınca Sheet'i kapatmak için */
  onNavigate?: () => void;
};

export default function AppSidebar({ variant = "desktop", onNavigate }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsible = variant === "desktop";
  const showCollapsed = isCollapsible && collapsed;

  return (
    <aside
      className={cn(
        "h-full flex flex-col bg-slate-900 text-white shrink-0",
        isCollapsible && "transition-all duration-300",
        showCollapsed ? "w-17" : "w-56"
      )}
    >
      {/* Brand */}
      <div className="shrink-0 px-4 h-14 flex items-center gap-2.5 border-b border-white/10">
        <span className="text-2xl shrink-0">🛵</span>
        {!showCollapsed && (
          <span className="text-sm font-bold tracking-tight whitespace-nowrap overflow-hidden">
            PaketSipariş
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto px-2">
        {!showCollapsed && (
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Menü
          </p>
        )}
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(pathname, item.href);
            const activeBg = "activeBg" in item ? item.activeBg : "bg-white/10";
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={showCollapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  showCollapsed && "justify-center px-0",
                  isActive
                    ? `${activeBg} text-white shadow-sm shadow-black/10`
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                )}
              >
                <Icon className={cn("h-4.5 w-4.5 shrink-0", isActive && item.color)} />
                {!showCollapsed && <span className="truncate">{item.label}</span>}
                {isActive && !showCollapsed && (
                  <div className={cn("ml-auto h-1.5 w-1.5 rounded-full", item.color.replace("text-", "bg-"))} />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Collapse toggle (desktop only) */}
      {isCollapsible && (
        <div className="shrink-0 border-t border-white/10 p-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
          >
            {showCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Daralt</span>
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}
