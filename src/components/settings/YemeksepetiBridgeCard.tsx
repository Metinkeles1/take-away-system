"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Plug, RefreshCw } from "lucide-react";

import {
  getYemeksepetiBridgeStatus,
  type YemeksepetiBridgeStatus,
} from "@/actions/yemeksepeti";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { YemeksepetiDispatchLogs } from "./YemeksepetiDispatchLogs";

function formatAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  return new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STEPS = [
  "Zip'i kasa bilgisayarında kalıcı bir klasöre çıkarın (ör. C:\\YemeksepetiKopru).",
  "Chrome'da chrome://extensions → sağ üstte Geliştirici modu'nu açın.",
  "Paketlenmemiş öğe yükle → zip'ten çıkan \"yemeksepeti-kopru\" klasörünü seçin.",
  "Yemeksepeti paneline girip sayfayı yenileyin (F5). Panel açık kalsın, bilgisayar uyumasın.",
];

// Yemeksepeti partner panelini okuyan Chrome eklentisi — indirme + durum.
// İndirilen pakette bu sitenin adresi ve bağlantı anahtarı hazır gelir.
export function YemeksepetiBridgeCard() {
  const [status, setStatus] = useState<YemeksepetiBridgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Sunucu eylemi istek düzeyinde düşerse (eski sekme/yeni deploy, ağ) eskiden
  // status null kalıyordu → yazı sonsuza dek "Kontrol ediliyor…", buton kilitli.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getYemeksepetiBridgeStatus());
      setFailed(false);
    } catch (err) {
      console.warn("[yemeksepeti status]", err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // İndirme yalnız anahtarın tanımsız olduğu KESİN bilindiğinde kilitlenir;
  // durum alınamadıysa indirme yine denenir (rota kendi kontrolünü yapar).
  const blocked = status?.configured === false;

  const statusText = !status
    ? failed
      ? "Durum alınamadı. Sayfayı yenileyin (Ctrl+F5); eklentiyi yine de indirebilirsiniz."
      : "Kontrol ediliyor…"
    : !status.configured
      ? "Sunucuda bağlantı anahtarı tanımlı değil (YEMEKSEPETI_INGEST_TOKEN)."
      : status.lastDataAt
        ? `Son veri: ${formatAgo(status.lastDataAt)} · ${status.orderCount} sipariş kayıtlı`
        : "Henüz veri gelmedi.";

  return (
    <section className="mb-8">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700">
              <Plug className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Yemeksepeti Köprüsü</p>
              <p className="text-xs text-muted-foreground">
                Kasadaki bilgisayarda Yemeksepeti paneli açıkken siparişleri bu sisteme
                aktaran Chrome eklentisi. Siparişleri okur; tek yazdığı şey kurye yola
                çıkınca Yemeksepeti&apos;ye &quot;yola çıktı&quot; bildirmektir (aşağıdan kapatılabilir).
              </p>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                status?.lastDataAt ? "bg-emerald-500" : "bg-muted-foreground/40"
              }`}
            />
            <span className="min-w-0 flex-1">{statusText}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Durumu yenile"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>

          <Button asChild className="w-full" disabled={blocked}>
            <a
              href="/api/yemeksepeti/extension"
              download
              aria-disabled={blocked}
              onClick={(e) => {
                if (blocked) e.preventDefault();
              }}
            >
              {loading && !status ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Eklentiyi indir
            </a>
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Paket bağlantı anahtarını içerir; kasa dışında kimseyle paylaşmayın.
          </p>

          <YemeksepetiDispatchLogs />
        </CardContent>
      </Card>
    </section>
  );
}
