"use client";

// Göreli zaman (örn. "3 dk önce") render eden client-only sarmalayıcı.
//
// `formatRelativeTime` render içinde `Date.now()` çağırdığı için SSR sırasında
// server vs client değerleri farklı olur ve React #418 (hydration mismatch)
// atar. useSyncExternalStore ile SSR snapshot'ı boş string sabit tutuyoruz;
// hidrasyon tamamlanınca client snapshot devreye girer ve interval ile
// canlı kalır. setState-in-effect anti-pattern'i olmadan çalışır.

import { useMemo, useSyncExternalStore } from "react";
import { formatRelativeTime } from "@/lib/utils";

const NOOP_UNSUBSCRIBE = () => {};

export function RelativeTime({
  date,
  refreshMs = 60_000,
}: {
  date: Date | string;
  refreshMs?: number;
}) {
  const subscribe = useMemo(
    () => (callback: () => void) => {
      if (refreshMs <= 0) return NOOP_UNSUBSCRIBE;
      const id = setInterval(callback, refreshMs);
      return () => clearInterval(id);
    },
    [refreshMs],
  );

  const label = useSyncExternalStore(
    subscribe,
    () => formatRelativeTime(date),
    () => "",
  );

  return <>{label}</>;
}
