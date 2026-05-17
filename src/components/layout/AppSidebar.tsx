"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getActiveOrdersCount } from "@/actions/orders";
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
  ChevronDown,
  Loader2,
  Store,
  LayoutDashboard,
  LineChart,
  UserSearch,
  Map as MapIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LucideIcon = React.ComponentType<{ className?: string }>;

type NavLeaf = {
  kind: "leaf";
  href: string;
  label: string;
  icon: LucideIcon;
  color: string;
  activeBg?: string;
};

type NavGroup = {
  kind: "group";
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  activeBg: string;
  basePath: string;
  children: { href: string; label: string; icon: LucideIcon }[];
};

type NavEntry = NavLeaf | NavGroup;

export const NAV_ITEMS: readonly NavEntry[] = [
  { kind: "leaf", href: "/",          label: "Panel",        icon: Home,           color: "text-slate-300" },
  { kind: "leaf", href: "/dashboard", label: "Dashboard",    icon: BarChart3,      color: "text-blue-400",   activeBg: "bg-blue-500/15" },
  {
    kind: "group",
    id: "trendyol",
    label: "Trendyol",
    icon: Store,
    color: "text-emerald-400",
    activeBg: "bg-emerald-500/15",
    basePath: "/dashboard/trendyol",
    children: [
      { href: "/dashboard/trendyol",           label: "Genel Bakış",     icon: LayoutDashboard },
      { href: "/dashboard/trendyol/sales",     label: "Satış Analitiği", icon: LineChart },
      { href: "/dashboard/trendyol/customers", label: "Müşteri",         icon: UserSearch },
      { href: "/dashboard/trendyol/regions",   label: "Bölgeler",        icon: MapIcon },
      { href: "/dashboard/trendyol/menu",      label: "Menü",            icon: UtensilsCrossed },
    ],
  },
  { kind: "leaf", href: "/orders/new", label: "Yeni Sipariş", icon: ShoppingBag,    color: "text-orange-400", activeBg: "bg-orange-500/15" },
  { kind: "leaf", href: "/orders",     label: "Siparişler",   icon: ClipboardList,  color: "text-emerald-400", activeBg: "bg-emerald-500/15" },
  { kind: "leaf", href: "/customers",  label: "Müşteriler",   icon: Users,          color: "text-pink-400",   activeBg: "bg-pink-500/15" },
  { kind: "leaf", href: "/corporate",  label: "Kurumsal",     icon: Building2,      color: "text-cyan-400",   activeBg: "bg-cyan-500/15" },
  { kind: "leaf", href: "/products",   label: "Menü",         icon: UtensilsCrossed, color: "text-amber-400", activeBg: "bg-amber-500/15" },
];

function isLeafActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/orders") {
    return pathname === "/orders" || (pathname.startsWith("/orders") && !pathname.startsWith("/orders/new"));
  }
  if (href === "/dashboard") {
    // Trendyol kendi grubuna ait; Dashboard sadece kendi alt yollarını kapsasın.
    if (pathname.startsWith("/dashboard/trendyol")) return false;
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  }
  return pathname.startsWith(href);
}

// Trendyol grubu alt-route'ları için tam eşleşme. /dashboard/trendyol kendisi
// yalnızca path tam eşit olduğunda aktif, diğer alt sayfalar prefix bazlı.
function isChildActive(pathname: string, href: string, basePath: string) {
  if (href === basePath) return pathname === basePath;
  return pathname === href || pathname.startsWith(href + "/");
}

type Props = {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
};

function useLiveCount(fetcher: () => Promise<number>) {
  const [count, setCount] = useState(0);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const c = await fetcherRef.current();
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

function LeafLink({
  item,
  isActive,
  showCollapsed,
  badge,
  onNavigate,
}: {
  item: NavLeaf;
  isActive: boolean;
  showCollapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const activeBg = item.activeBg ?? "bg-white/10";
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={showCollapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
        showCollapsed && "justify-center px-0",
        isActive
          ? `${activeBg} text-white shadow-sm shadow-black/10`
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
      )}
    >
      <LeafInner item={item} isActive={isActive} showCollapsed={showCollapsed} badge={badge} />
    </Link>
  );
}

function LeafInner({
  item,
  isActive,
  showCollapsed,
  badge,
}: {
  item: NavLeaf;
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
          <Loader2 className={cn("h-4.5 w-4.5 animate-spin", isActive ? item.color : "text-slate-300")} />
        ) : (
          <Icon className={cn("h-4.5 w-4.5", isActive && item.color)} />
        )}
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
        <div className={cn("ml-auto h-1.5 w-1.5 rounded-full", item.color.replace("text-", "bg-"))} />
      )}
    </>
  );
}

function GroupBlock({
  group,
  pathname,
  showCollapsed,
  expanded,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  showCollapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  const anyActive = pathname.startsWith(group.basePath);

  // Daraltılmış modda grup tek bir link gibi davranır (default'a götürür)
  if (showCollapsed) {
    return (
      <Link
        href={group.basePath}
        onClick={onNavigate}
        title={group.label}
        className={cn(
          "flex items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
          anyActive
            ? `${group.activeBg} text-white shadow-sm shadow-black/10`
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
        )}
      >
        <Icon className={cn("h-4.5 w-4.5", anyActive && group.color)} />
      </Link>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
          anyActive
            ? `${group.activeBg} text-white shadow-sm shadow-black/10`
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
        )}
      >
        <Icon className={cn("h-4.5 w-4.5 shrink-0", anyActive && group.color)} />
        <span className="truncate">{group.label}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 transition-transform duration-200 text-slate-500",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {group.children.map((c) => {
            const active = isChildActive(pathname, c.href, group.basePath);
            const ChildIcon = c.icon;
            return (
              <li key={c.href}>
                <Link
                  href={c.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                  )}
                >
                  <ChildIcon className={cn("h-3.5 w-3.5", active && group.color)} />
                  <span className="truncate">{c.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AppSidebar({ variant = "desktop", onNavigate }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsible = variant === "desktop";
  const showCollapsed = isCollapsible && collapsed;
  const activeOrdersCount = useLiveCount(getActiveOrdersCount);

  // Grup expand override'ları. undefined = otomatik (route aktifse açık).
  // Kullanıcı bir grubu elle açar/kapatırsa override sabitlenir; tekrar
  // tıklamadan tersine dönmez. Pathname değişiminde otomatik state'i takip
  // edebilmek için override'ları render sırasında derive ediyoruz.
  const [override, setOverride] = useState<Record<string, boolean>>({});

  function isGroupExpanded(group: NavGroup): boolean {
    return override[group.id] ?? pathname.startsWith(group.basePath);
  }

  function toggleGroup(group: NavGroup) {
    setOverride((p) => ({
      ...p,
      [group.id]: !isGroupExpanded(group),
    }));
  }

  return (
    <aside
      className={cn(
        "h-full flex flex-col bg-slate-900 text-white shrink-0",
        isCollapsible && "transition-all duration-300",
        showCollapsed ? "w-17" : "w-56",
      )}
    >
      <div className="shrink-0 px-4 h-14 flex items-center gap-2.5 border-b border-white/10">
        <span className="text-2xl shrink-0">🛵</span>
        {!showCollapsed && (
          <span className="text-sm font-bold tracking-tight whitespace-nowrap overflow-hidden">
            PaketSipariş
          </span>
        )}
      </div>

      <nav className="flex-1 py-4 overflow-y-auto px-2">
        {!showCollapsed && (
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Menü
          </p>
        )}
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            if (item.kind === "group") {
              return (
                <GroupBlock
                  key={item.id}
                  group={item}
                  pathname={pathname}
                  showCollapsed={showCollapsed}
                  expanded={isGroupExpanded(item)}
                  onToggle={() => toggleGroup(item)}
                  onNavigate={onNavigate}
                />
              );
            }
            const active = isLeafActive(pathname, item.href);
            return (
              <LeafLink
                key={item.href}
                item={item}
                isActive={active}
                showCollapsed={showCollapsed}
                badge={item.href === "/orders" ? activeOrdersCount : undefined}
                onNavigate={onNavigate}
              />
            );
          })}
        </div>
      </nav>

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
