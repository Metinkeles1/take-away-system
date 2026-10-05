import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type CategoryOptions, type Product } from "@/types";
import { getAvailableProducts, getProductSalesRanking } from "@/actions/products";
import { getCategoryOptions } from "@/actions/menuOptions";

interface MenuStore {
  items: Product[];
  /** productId -> toplam satılan adet (iptaller hariç). Menüyü popülerliğe göre sıralar. */
  salesRank: Record<string, number>;
  /** Kategori seçenekleri (soğansız, yumurtalı +30₺…). null = henüz yüklenmedi → varsayılan. */
  categoryOptions: CategoryOptions | null;
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
      salesRank: {},
      categoryOptions: null,
      fetchedAt: null,
      isRefreshing: false,

      loadMenu: async () => {
        if (get().isRefreshing) return;
        set({ isRefreshing: true });
        try {
          const [fresh, salesRank, categoryOptions] = await Promise.all([
            getAvailableProducts(),
            getProductSalesRanking(),
            // Seçenekler okunamazsa menü yine açılsın — varsayılan liste kullanılır
            getCategoryOptions().catch(() => get().categoryOptions),
          ]);
          set({ items: fresh, salesRank, categoryOptions, fetchedAt: Date.now() });
        } finally {
          set({ isRefreshing: false });
        }
      },
    }),
    {
      name: "menu-cache",
      // Şema/görsel alanları değiştikçe bu sürümü artır → eski (ör. resimsiz)
      // cache'ler kullanıcı tarayıcılarında otomatik atılır, menü taze çekilir.
      version: 3,
      // Sürüm uyuşmazlığında veriyi merge'e bırak (merge zaten yaşa göre bayat
      // cache'i atıyor). migrate tanımlı olmazsa Zustand konsola uyarı basar.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<MenuStore>;
        return {
          items: p.items ?? [],
          salesRank: p.salesRank ?? {},
          categoryOptions: p.categoryOptions ?? null,
          fetchedAt: p.fetchedAt ?? null,
        };
      },
      partialize: (state) => ({
        items: state.items,
        salesRank: state.salesRank,
        categoryOptions: state.categoryOptions,
        fetchedAt: state.fetchedAt,
      }),
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
          salesRank: fresh ? (p?.salesRank ?? {}) : {},
          categoryOptions: fresh ? (p?.categoryOptions ?? null) : null,
          fetchedAt: fresh ? (p?.fetchedAt ?? null) : null,
        };
      },
    },
  ),
);
