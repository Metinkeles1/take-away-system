"use client";

import { toast } from "sonner";
import { syncTrendyolCourierPackages } from "@/actions/trendyolCourier";
import { usePanelData } from "@/components/panel/usePanelData";
import { useTrendyolAutoSync } from "@/hooks/useTrendyolAutoSync";
import { PanelView } from "@/components/panel/PanelView";

// Ana panel — canlı veriyle PanelView.
export default function PanelPage() {
  const { board, summary, cash, live, loadBoard, loadSummary } = usePanelData();
  useTrendyolAutoSync();

  // Bir işlemden sonra listeyi hemen, parayı/özeti de tazele.
  const changed = () => {
    void loadBoard();
    void loadSummary();
  };

  const syncTrendyol = async () => {
    try {
      const res = await syncTrendyolCourierPackages();
      if (!res.configured) toast.info("Trendyol entegrasyonu tanımlı değil");
      else if (!res.ok) toast.error(res.error ?? "Trendyol’a ulaşılamadı");
      else toast.success(`Trendyol güncellendi · ${res.orders.length} aktif paket`);
      await loadBoard();
    } catch {
      toast.error("Trendyol’a ulaşılamadı");
    }
  };

  return (
    <PanelView
      board={board}
      summary={summary}
      cash={cash}
      live={live}
      onChanged={changed}
      onSyncTrendyol={syncTrendyol}
    />
  );
}
