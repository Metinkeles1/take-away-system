import "server-only";

// Tüm Trendyol hesaplarının mağaza (şube) ID'leri.
// Hesabın Ayarlar'da kayıtlı mağaza listesi varsa o kullanılır; yoksa o hesabın
// son 30 günlük paketlerinden bulunur.

import { getTrendyolAccounts, type TrendyolCreds } from "./accounts";
import { listTrendyolPackages } from "./client";

const DAY_MS = 24 * 60 * 60 * 1000;

// Hesabın son paketlerinden mağaza ID'lerini çıkar (Ayarlar'daki "Bağlantıyı test
// et" de bunu kullanır).
export async function discoverStoreIds(account: TrendyolCreds): Promise<number[]> {
  const end = Date.now();
  const start = end - 30 * DAY_MS;
  const stores = new Set<number>();
  let page = 0;
  while (page < 5) {
    const res = await listTrendyolPackages({
      modificationStartDate: start,
      modificationEndDate: end,
      page,
      size: 50,
      account,
    });
    if (!res.ok) break;
    for (const p of res.data.content ?? []) {
      if (p.storeId) stores.add(p.storeId);
    }
    if (stores.size > 0 || page + 1 >= (res.data.totalPages ?? 1)) break;
    page++;
  }
  return [...stores];
}

export async function resolveTrendyolStoreIds(): Promise<number[]> {
  const accounts = await getTrendyolAccounts();
  const lists = await Promise.all(
    accounts.map(async (a) => {
      if (a.storeIds.length > 0) return a.storeIds;
      try {
        return await discoverStoreIds(a);
      } catch {
        return [];
      }
    }),
  );
  return [...new Set(lists.flat())];
}
