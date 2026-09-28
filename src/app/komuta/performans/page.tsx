"use client";

import { useKomutaFilters } from "@/components/dashboard/komuta/KomutaShell";
import { KomutaPerformancePanel } from "@/components/dashboard/komuta/performance/KomutaPerformancePanel";

// Komuta › Performans — ürün satış hareketi + kurye teslim süreleri. Veriler
// Genel Bakış'taki "Dikkat" şeridiyle ortak sorgulardan (hafızada hazır bekler).
export default function KomutaPerformancePage() {
  const { period, channel, dayOffset } = useKomutaFilters();
  return <KomutaPerformancePanel period={period} channel={channel} dayOffset={dayOffset} />;
}
