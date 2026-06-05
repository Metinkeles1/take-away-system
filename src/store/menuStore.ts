import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Product } from "@/types";
import { getAvailableProducts } from "@/actions/products";

interface MenuStore {
  items: Product[];
  fetchedAt: number | null;
  isRefreshing: boolean;
  /**
   * SWR davranışı: cache varsa anında döner, arka planda yine de fetch eder.
   * Cache yoksa fetch'i bekler.
   */
  loadMenu: () => Promise<void>;
}

export const useMenuStore = create<MenuStore>()(
  persist(
    (set, get) => ({
      items: [],
      fetchedAt: null,
      isRefreshing: false,

      loadMenu: async () => {
        if (get().isRefreshing) return;
        set({ isRefreshing: true });
        try {
          const fresh = await getAvailableProducts();
          set({ items: fresh, fetchedAt: Date.now() });
        } finally {
          set({ isRefreshing: false });
        }
      },
    }),
    {
      name: "menu-cache",
      // Şema/görsel alanları değiştikçe bu sürümü artır → eski (ör. resimsiz)
      // cache'ler kullanıcı tarayıcılarında otomatik atılır, menü taze çekilir.
      version: 1,
      partialize: (state) => ({ items: state.items, fetchedAt: state.fetchedAt }),
      // Bayat cache (ör. ürün resimleri eklenmeden önce kaydedilmiş) resimsiz
      // kart flash'ı yapmasın: belirli yaşı geçmişse boş başla, skeleton göster,
      // loadMenu taze veriyi (resimlerle) getirsin.
      merge: (persisted, current) => {
        const p = persisted as Partial<MenuStore> | undefined;
        const MAX_AGE = 12 * 60 * 60 * 1000; // 12 saat
        const fresh = p?.fetchedAt != null && Date.now() - p.fetchedAt < MAX_AGE;
        return {
          ...current,
          items: fresh ? (p?.items ?? []) : [],
          fetchedAt: fresh ? (p?.fetchedAt ?? null) : null,
        };
      },
    },
  ),
);
