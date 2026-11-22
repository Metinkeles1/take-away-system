// İstek kapsamında "sadece bu Trendyol işletmesi" filtresi.
//
// Komuta Merkezi'nde işletme seçilince ilgili istek runWithTrendyolScope içinde
// çalışır. Böylece raporları tek tek değiştirmeden:
//  - Trendyol API çağrıları yalnız o hesaba gider (accounts.getTrendyolAccounts),
//  - TrendyolOrder arşiv okumaları yalnız o hesabın siparişlerini görür (model
//    sorgu kancaları, bkz. models/TrendyolOrder.ts),
//  - önbellek anahtarları kapsamı içerir (trendyolScopeKey).
// Kapsam yoksa her şey eskisi gibi tüm hesapları kapsar.

import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<{ supplierId: string }>();

export function runWithTrendyolScope<T>(supplierId: string | null | undefined, fn: () => T): T {
  if (!supplierId) return fn();
  return als.run({ supplierId }, fn);
}

export function trendyolScope(): string | null {
  return als.getStore()?.supplierId ?? null;
}

// Önbellek anahtarına eklenecek parça ("all" ya da satıcı ID).
export function trendyolScopeKey(): string {
  return trendyolScope() ?? "all";
}

// Kapsamın dışına çık: arşiv/yorum senkronu gibi TÜM hesapları ilgilendiren
// işler, tek işletme seçiliyken tetiklense de hepsini senkronlamalı.
export function runUnscoped<T>(fn: () => T): T {
  return als.exit(fn);
}
