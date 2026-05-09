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
      partialize: (state) => ({ items: state.items, fetchedAt: state.fetchedAt }),
    },
  ),
);
