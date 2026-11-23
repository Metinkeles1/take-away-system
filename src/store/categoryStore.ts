import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MenuCategory } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { getMenuCategories } from "@/actions/menuCategories";

interface CategoryStore {
  categories: MenuCategory[];
  loaded: boolean;
  load: () => Promise<void>;
  setCategories: (list: MenuCategory[]) => void;
}

let inflight: Promise<void> | null = null;

// Menü kategorileri — tarayıcıda önbelleklenir, ilk kullanımda sunucudan tazelenir.
export const useCategoryStore = create<CategoryStore>()(
  persist(
    (set) => ({
      categories: MENU_CATEGORIES,
      loaded: false,
      load: () => {
        if (!inflight) {
          const p: Promise<void> = getMenuCategories()
            .then((categories) => {
              set({ categories, loaded: true });
            })
            .catch(() => undefined)
            .finally(() => {
              inflight = null;
            });
          inflight = p;
          return p;
        }
        return inflight;
      },
      setCategories: (categories) => set({ categories, loaded: true }),
    }),
    {
      name: "menu-categories",
      partialize: (s) => ({ categories: s.categories }),
      // Sunucu varsayılanla çizer; önbellek mount sonrası okunur (hydration uyuşmazlığı olmasın)
      skipHydration: true,
    },
  ),
);

/** Sıralı kategori listesi. Sayfa açılışında bir kez sunucudan tazeler. */
export function useMenuCategories(): MenuCategory[] {
  const categories = useCategoryStore((s) => s.categories);
  const loaded = useCategoryStore((s) => s.loaded);
  const load = useCategoryStore((s) => s.load);
  useEffect(() => {
    if (loaded) return;
    // Önce tarayıcı önbelleği (anında), sonra sunucudan taze liste
    if (!useCategoryStore.persist.hasHydrated()) void useCategoryStore.persist.rehydrate();
    void load();
  }, [loaded, load]);
  return categories;
}
