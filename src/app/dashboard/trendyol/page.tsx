"use client";

import { useState } from "react";
import { Store, LayoutDashboard, UtensilsCrossed, Map } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "./OverviewTab";
import { MenuTab } from "./MenuTab";
import { RegionsTab } from "./RegionsTab";

type TrendyolTab = "overview" | "menu" | "regions";

export default function TrendyolDashboardPage() {
  const [tab, setTab] = useState<TrendyolTab>("overview");

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="shrink-0 bg-white border-b px-8 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Store className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Trendyol Dashboard</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Sipariş, menü ve bölge analizi · Trendyol GO Yemek
              </p>
            </div>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TrendyolTab)}
          className="mt-4"
        >
          <TabsList variant="line" className="gap-1">
            <TabsTrigger value="overview" className="gap-2 px-4">
              <LayoutDashboard className="h-4 w-4" />
              Genel Bakış
            </TabsTrigger>
            <TabsTrigger value="menu" className="gap-2 px-4">
              <UtensilsCrossed className="h-4 w-4" />
              Menü
            </TabsTrigger>
            <TabsTrigger value="regions" className="gap-2 px-4">
              <Map className="h-4 w-4" />
              Bölgeler
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto bg-linear-to-br from-orange-50/40 via-gray-50 to-white">
        <div className="px-8 py-6">
          {tab === "overview" && <OverviewTab />}
          {tab === "menu" && <MenuTab />}
          {tab === "regions" && <RegionsTab />}
        </div>
      </div>
    </div>
  );
}
