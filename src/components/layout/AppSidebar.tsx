"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getActiveTrendyolCount } from "@/actions/orders";
import {
  Home,
  BarChart3,
  ShoppingBag,
  ClipboardList,
  Users,
  Building2,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Panel", icon: Home, color: "text-slate-300" },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, color: "text-blue-400", activeBg: "bg-blue-500/15" },
  { href: "/dashboard/trendyol", label: "Trendyol", icon: Store, color: "text-emerald-400", activeBg: "bg-emerald-500/15" },
  { href: "/orders/new", label: "Yeni Sipariş", icon: ShoppingBag, color: "text-orange-400", activeBg: "bg-orange-500/15" },
  { href: "/orders", label: "Siparişler", icon: ClipboardList, color: "text-emerald-400", activeBg: "bg-emerald-500/15" },
  { href: "/customers", label: "Müşteriler", icon: Users, color: "text-pink-400", activeBg: "bg-pink-500/15" },
  { href: "/corporate", label: "Kurumsal", icon: Building2, color: "text-cyan-400", activeBg: "bg-cyan-500/15" },
  { href: "/products", label: "Menü", icon: UtensilsCrossed, color: "text-amber-400", activeBg: "bg-amber-500/15" },
] as const;

function isItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/orders") {
    return pathname === "/orders" || (pathname.startsWith("/orders") && !pathname.startsWith("/orders/new"));
  }
  // Trendyol kendi sayfasına taşındı (/dashboard/trendyol); ana dashboard onu kapsamasın.
  if (href === "/dashboard/trendyol") return pathname.startsWith("/dashboard/trendyol");
  if (href === "/dashboard") {
    return pathname === "/dashboard" || (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/"));
  }
  if (pathname.startsWith("/dashboard")) return false;
  return pathname.startsWith(href);
}

type Props = {
  /** Mobil Sheet içinde render edilirken collapsible olmasın */
  variant?: "desktop" | "mobile";
  /** Mobilde linke tıklayınca Sheet'i kapatmak için */
  onNavigate?: () => void;
};

type NavItem = (typeof NAV_ITEMS)[number];

// Aktif Trendyol siparişlerini sayar; sidebar Trendyol linkindeki canlı rozet için.
// 20 saniyede bir yenilenir + tab odağa geldiğinde tazelenir.
function useTrendyolActiveCount() {
  const [count, setCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const c = await getActiveTrendyolCount();
        if (mountedRef.current) setCount(c);
      } catch {
        // sessizce geç
      }
    };

    tick();
    timer = setInterval(() => {
      if (!document.hidden) void tick();
    }, 20_000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);

    return () => {
      mountedRef.current = false;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return count;
}

function NavItemContent({
  item,
  isActive,
  showCollapsed,
  badge,
}: {
  item: NavItem;
  isActive: boolean;
  showCollapsed: boolean;
  badge?: number;
}) {
  const { pending } = useLinkStatus();
  const Icon = item.icon;
  const hasBadge = badge !== undefined && badge > 0;

  return (
    <>
      <div className="relative shrink-0">
        {pending ? (
          <Loader2
            className={cn(
              "h-4.5 w-4.5 animate-spin",
              isActive ? item.color : "text-slate-300",
            )}
          />
        ) : (
          <Icon className={cn("h-4.5 w-4.5", isActive && item.color)} />
        )}
        {/* Daraltılmış sidebar'da rozeti ikonun köşesinde göster */}
        {hasBadge && showCollapsed && (
          <span className="absolute -top-1.5 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white ring-2 ring-slate-900">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      {!showCollapsed && <span className="truncate">{item.label}</span>}
      {hasBadge && !showCollapsed && (
        <span className="ml-auto relative inline-flex items-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
            {badge > 99 ? "99+" : badge}
          </span>
        </span>
      )}
      {isActive && !showCollapsed && !pending && !hasBadge && (
        <div
          className={cn(
            "ml-auto h-1.5 w-1.5 rounded-full",
            item.color.replace("text-", "bg-"),
          )}
        />
      )}
    </>
  );
}

export default function AppSidebar({ variant = "desktop", onNavigate }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsible = variant === "desktop";
  const showCollapsed = isCollapsible && collapsed;
  const trendyolActiveCount = useTrendyolActiveCount();

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
                <NavItemContent
                  item={item}
                  isActive={isActive}
                  showCollapsed={showCollapsed}
                  badge={
                    item.href === "/dashboard/trendyol"
                      ? trendyolActiveCount
                      : undefined
                  }
                />
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
