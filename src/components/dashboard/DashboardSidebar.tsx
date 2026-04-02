"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ClipboardList,
  Users,
  UtensilsCrossed,
  Home,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";

const navSections = [
  {
    title: "Ana Menü",
    items: [
      { href: "/", label: "Ana Sayfa", icon: Home },
      { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { href: "/orders/new", label: "Yeni Sipariş", icon: Plus },
      { href: "/orders", label: "Siparişler", icon: ClipboardList },
      { href: "/customers", label: "Müşteriler", icon: Users },
      { href: "/products", label: "Menü", icon: UtensilsCrossed },
    ],
  },
];

export default function DashboardSidebar() {
  const pathname = usePathname();
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
        <span className="text-xl shrink-0">🛵</span>
        {!collapsed && (
          <span className="text-sm font-bold tracking-tight whitespace-nowrap overflow-hidden">
            PaketSipariş
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto space-y-6 px-2">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : item.href === "/orders"
                      ? pathname === "/orders" ||
                        (pathname.startsWith("/orders") &&
                          !pathname.startsWith("/orders/new"))
                      : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-white/15 text-white shadow-sm shadow-black/10"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    )}
                  >
                    <Icon className={cn("h-4.5 w-4.5 shrink-0", isActive && "text-blue-400")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {isActive && !collapsed && (
                      <div className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

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
