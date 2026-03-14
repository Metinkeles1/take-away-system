"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, ClipboardList, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Panel", icon: Home },
  { href: "/orders/new", label: "Yeni Sipariş", icon: ShoppingBag },
  { href: "/orders", label: "Siparişler", icon: ClipboardList },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="shrink-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-2xl">🛵</span>
          <span>PaketSipariş</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
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
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
