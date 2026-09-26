"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, History, RefreshCw } from "lucide-react";

import {
  backfillTrendyolArchiveChunk,
  getTrendyolArchiveStatus,
  syncTrendyolArchiveNow,
  type TrendyolArchiveStatus,
} from "@/actions/trendyolArchive";
import { Button } from "@/components/ui/button";

// "Geçmişi yükle" en fazla bu kadar 15 günlük parça geriye iner. Trendyol
// pratikte ~son 1 ayı verir; sınıra gelince (reachedLimit) ya da art arda iki
// boş parçada durur.
const MAX_CHUNKS = 6;

function fmtDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAgo(ts: number | null): string {
  if (!ts) return "hiç";
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.round(h / 24)} gün önce`;
}

// Trendyol sipariş arşivinin durumu + "Güncelle" / "Geçmişi yükle".
export function TrendyolArchiveBar({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<TrendyolArchiveStatus | null>(null);
  const [busy, setBusy] = useState<"sync" | "backfill" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getTrendyolArchiveStatus());
    } catch {
      /* durum gösterilemezse bar sessiz kalır */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getTrendyolArchiveStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleSync = async () => {
    setBusy("sync");
    setMessage(null);
    const res = await syncTrendyolArchiveNow();
    setMessage(res.ok ? "Arşiv güncellendi." : `Güncellenemedi: ${res.error ?? "bilinmeyen hata"}`);
    await loadStatus();
    onChanged?.();
    setBusy(null);
  };

  const handleBackfill = async () => {
    const ok = window.confirm(
      "Trendyol'un verdiği tüm geçmiş (yaklaşık son 1 ay) siparişler ve hakediş kayıtları arşive çekilecek. Yarım dakika kadar sürebilir, bu sırada sayfayı kapatma. Devam edilsin mi?",
    );
    if (!ok) return;
    setBusy("backfill");
    let total = 0;
    let emptyStreak = 0;
    let stopped: string | null = null;
    for (let i = 0; i < MAX_CHUNKS; i++) {
      setMessage(`Geçmiş yükleniyor… ${i + 1}/${MAX_CHUNKS} parça · ${total} sipariş`);
      const res = await backfillTrendyolArchiveChunk(i);
      if (!res.ok) {
        stopped = `${fmtDate(res.from)} civarında durdu: ${res.error ?? "hata"}`;
        break;
      }
      total += res.packages;
      if (res.reachedLimit) break;
      emptyStreak = res.packages === 0 ? emptyStreak + 1 : 0;
      if (emptyStreak >= 2) break;
    }
    setMessage(
      stopped
        ? `${stopped} · ${total} sipariş yüklendi`
        : `Geçmiş yüklendi · ${total} sipariş işlendi.`,
    );
    await loadStatus();
    onChanged?.();
    setBusy(null);
  };

  if (status && !status.configured) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2 text-muted-foreground">
        <Archive className="mt-0.5 size-3.5 shrink-0" />
        <p className="min-w-0">
          {status ? (
            <>
              Arşivde <b className="text-foreground">{status.orderCount.toLocaleString("tr-TR")}</b> Trendyol
              siparişi · en eski {fmtDate(status.oldestOrderAt)} · son güncelleme {fmtAgo(status.lastSyncAt)}
            </>
          ) : (
            "Arşiv durumu yükleniyor…"
          )}
          {message && <span className="block text-foreground">{message}</span>}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleSync} disabled={busy !== null}>
          <RefreshCw className={`size-3.5 ${busy === "sync" ? "animate-spin" : ""}`} />
          Güncelle
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleBackfill} disabled={busy !== null}>
          <History className={`size-3.5 ${busy === "backfill" ? "animate-pulse" : ""}`} />
          Geçmişi yükle
        </Button>
      </div>
    </div>
  );
}
