"use client";

// Trendyol GO Yemek "Çok Al Az Öde" sepet kampanyaları.
//
// Önemli: Bu kampanyalar Trendyol promosyon API'sinden GELMEZ. Yemek (MEAL)
// kanalı promosyon endpoint'ini desteklemiyor ("Desteklenmeyen channel"),
// GROCERY ise bu mağazaya ait olmayan binlerce kayıt döndürüyor. Restoranın
// gerçek kademeleri sözleşmeyle belirlenir ve `trendyolCampaigns.ts` içinde
// tutulur; panelden (Menü › kademe ayarları) düzenlenen hali sunucuda saklanır.
// Bu sayfa kayıtlı ayarları gösterir; menü indirim hesabı da aynısını kullanır.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Zap, Info, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type CampaignGroup, type CampaignTier } from "@/lib/trendyolCampaigns";
import {
  getCampaignSettings,
  type CampaignSettings,
} from "@/actions/trendyolCampaignSettings";
import { formatCurrency } from "@/lib/utils";

export function PromotionsTab() {
  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  useEffect(() => {
    getCampaignSettings().then(setSettings);
  }, []);

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
          <Megaphone className="h-5 w-5 text-emerald-600" />
          Kampanyalar
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Çok Al Az Öde · {settings?.groups.length ?? 5} kademe grubu
        </p>
        <Link
          href="/dashboard/trendyol/menu"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Kademeleri Menü sayfasından düzenle
        </Link>
      </div>

      {/* Bilgi notu */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Bu kademeler sözleşmenle belirlenir ve Trendyol partner panelinden
          yönetilir; API ile düzenlenemez. Sepet tutarının ulaştığı{" "}
          <b>en yüksek kademe</b> geçerlidir (kademeler katlanmaz).{" "}
          <span className="inline-flex items-center gap-1 font-medium text-violet-700">
            <Zap className="h-3.5 w-3.5" />
            Flaş
          </span>{" "}
          indirim yalnızca Trendyol GO uygulaması siparişlerinde geçerlidir.
        </span>
      </div>

      {/* Grup listesi */}
      <div className="space-y-3">
        {!settings
          ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
          : settings.groups.map((group) => (
              <CampaignGroupRow
                key={group.id}
                group={group}
                active={group.id === settings.activeGroupId}
              />
            ))}
      </div>
    </div>
  );
}

function CampaignGroupRow({
  group,
  active,
}: {
  group: CampaignGroup;
  active: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Grup başlığı */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
        <h2 className="font-medium text-gray-900">Grup {group.id}</h2>
        {active && (
          <Badge variant="default" className="shrink-0">
            Menüde aktif
          </Badge>
        )}
      </div>

      {/* Kademeler */}
      <div className="divide-y divide-gray-100">
        {group.tiers.map((tier, i) => (
          <TierRow key={`r${i}`} tier={tier} />
        ))}
        {group.flash.map((tier, i) => (
          <TierRow key={`f${i}`} tier={tier} flash />
        ))}
      </div>
    </div>
  );
}

function TierRow({ tier, flash }: { tier: CampaignTier; flash?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${
        flash ? "bg-violet-50/50" : ""
      }`}
    >
      <span className="flex items-center gap-1.5 text-gray-600">
        {flash && <Zap className="h-3.5 w-3.5 text-violet-600" />}
        {formatCurrency(tier.min)} ve üzeri
        {flash && (
          <span className="text-xs text-violet-600">· yalnız uygulama</span>
        )}
      </span>
      <span
        className={`shrink-0 font-semibold tabular-nums ${
          flash ? "text-violet-700" : "text-orange-700"
        }`}
      >
        −{formatCurrency(tier.discount)}
      </span>
    </div>
  );
}
