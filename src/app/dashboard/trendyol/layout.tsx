"use client";

import { useEffect } from "react";
import { ChevronRight, Store } from "lucide-react";
import { usePathname } from "next/navigation";

// Sub-page'in breadcrumb son segmenti (büyük h2'yi layout duplicate etmez,
// sadece "Trendyol › X" şeklinde bağlam verir).
const CRUMBS: Record<string, string> = {
  "/dashboard/trendyol":           "Genel Bakış",
  "/dashboard/trendyol/sales":     "Satış Analitiği",
  "/dashboard/trendyol/customers": "Müşteri Analizi",
  "/dashboard/trendyol/regions":   "Bölgeler",
  "/dashboard/trendyol/menu":      "Menü",
  "/dashboard/trendyol/categories": "Kategoriler",
  "/dashboard/trendyol/reviews":   "Değerlendirmeler",
};

export default function TrendyolLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const crumb = CRUMBS[pathname];

  // Client-side title (page.tsx'ler "use client" olduğu için metadata export edemiyor).
  useEffect(() => {
    document.title = crumb
      ? `${crumb} · Trendyol · Paket Sipariş`
      : "Trendyol · Paket Sipariş";
  }, [crumb]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="shrink-0 bg-white border-b px-4 sm:px-8 py-2.5">
        <nav
          aria-label="Sayfa konumu"
          className="flex items-center gap-1.5 text-xs"
        >
          <Store className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="font-medium text-gray-700">Trendyol</span>
          {crumb && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="text-gray-500 truncate">{crumb}</span>
            </>
          )}
        </nav>
      </header>

      <div className="flex-1 min-h-0 bg-muted/30 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
