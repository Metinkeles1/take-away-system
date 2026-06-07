import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getCampaignGroup, type CampaignTier } from "@/lib/trendyolCampaigns";

// Flaş indirim kademeleri Trendyol'da dönemsel değişir; kod değiştirmeden
// panelden ayarlanabilsin diye tarayıcıda (localStorage) tutulur.
// Varsayılan, kodda tanımlı Grup 1 flaş kademeleridir (menü onu kullanır).
const DEFAULT: CampaignTier[] = getCampaignGroup(1)!.flash;

interface FlashSettingsStore {
  tiers: CampaignTier[]; // flaş kademeleri (artan eşik)
  setTiers: (tiers: CampaignTier[]) => void;
  reset: () => void;
}

export const useFlashSettings = create<FlashSettingsStore>()(
  persist(
    (set) => ({
      tiers: DEFAULT,
      setTiers: (tiers) =>
        set({ tiers: [...tiers].sort((a, b) => a.min - b.min) }),
      reset: () => set({ tiers: DEFAULT }),
    }),
    {
      name: "trendyol-flash-settings",
      // v1 tek eşikli (min/discount) şemayı tutuyordu; v2 kademe dizisine geçti.
      version: 2,
      // Eski (v1) kaydı çok-kademeli şemaya taşı: tek eşiği tek kademeye çevir,
      // yoksa varsayılana dön. migrate olmadan zustand state'i hiç yüklemez.
      migrate: (persisted, version) => {
        if (version < 2) {
          const old = persisted as { min?: number; discount?: number } | undefined;
          if (old?.min != null && old?.discount != null) {
            return { tiers: [{ min: old.min, discount: old.discount }] };
          }
          return { tiers: DEFAULT };
        }
        return persisted as { tiers: CampaignTier[] };
      },
    },
  ),
);
