"use client";

// Göreli zaman (örn. "3 dk önce") render eden client-only sarmalayıcı.
//
// `formatRelativeTime` render içinde `Date.now()` çağırdığı için SSR sırasında
// server vs client değerleri farklı olur ve React #418 (hydration mismatch)
// atar. Bu component server'da BOŞ string render eder; mount sonrası gerçek
// değeri set eder. Böylece hidrasyon güvenli.

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/utils";

export function RelativeTime({
  date,
  refreshMs = 60_000,
}: {
  date: Date | string;
  refreshMs?: number;
}) {
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    setLabel(formatRelativeTime(date));
    if (refreshMs <= 0) return;
    const id = setInterval(() => setLabel(formatRelativeTime(date)), refreshMs);
    return () => clearInterval(id);
  }, [date, refreshMs]);

  return <>{label}</>;
}
