"use client";

import { Store } from "lucide-react";
import { usePathname } from "next/navigation";

const TITLES: Record<string, { title: string; sub: string }> = {
  "/dashboard/trendyol":           { title: "Trendyol · Genel Bakış",      sub: "Satış özeti, ciro ve net hakediş" },
  "/dashboard/trendyol/sales":     { title: "Trendyol · Satış Analitiği",  sub: "Trend, kategori ve zaman dilimi kırılımı" },
  "/dashboard/trendyol/customers": { title: "Trendyol · Müşteri Analizi",  sub: "Tekrar eden müşteri ve frekans analizi" },
  "/dashboard/trendyol/regions":   { title: "Trendyol · Bölgeler",         sub: "Mahalle bazlı satış haritası" },
  "/dashboard/trendyol/menu":      { title: "Trendyol · Menü",             sub: "Ürün durumu ve stok takibi" },
};

export default function TrendyolLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const meta = TITLES[pathname] ?? {
    title: "Trendyol Dashboard",
    sub: "Trendyol GO Yemek",
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="shrink-0 bg-white border-b px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Store className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{meta.title}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{meta.sub}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30">
        <div className="px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
