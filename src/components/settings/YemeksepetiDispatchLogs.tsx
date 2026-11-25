"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import {
  getYemeksepetiDispatchState,
  setYemeksepetiAutoDispatch,
} from "@/actions/yemeksepeti";
import type { DispatchLogRow } from "@/lib/yemeksepeti/dispatch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  queued: "Sıraya alındı",
  attempt: "Denendi",
  learned: "Kasada elle basıldı",
  skipped: "Gönderilmedi",
};

function rowTone(r: DispatchLogRow): string {
  if (r.kind === "attempt") return r.ok ? "bg-emerald-500" : "bg-rose-500";
  if (r.kind === "learned") return "bg-sky-500";
  if (r.kind === "skipped") return "bg-amber-500";
  return "bg-muted-foreground/40";
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Otomatik "yola çıktı" — aç/kapa + son denemelerin kaydı. "Kayıtları kopyala"
// ile tümü panoya alınır (geliştiriciye iletmek için). Kayıtlarda giriş
// anahtarı ve müşteri bilgisi YOK; sadece gönderilen içerik ve sonuç.
export function YemeksepetiDispatchLogs() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<DispatchLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getYemeksepetiDispatchState();
      setEnabled(s.enabled);
      setLogs(s.logs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void getYemeksepetiDispatchState()
      .then((s) => {
        setEnabled(s.enabled);
        setLogs(s.logs);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (on: boolean) => {
    setEnabled(on);
    const res = await setYemeksepetiAutoDispatch(on);
    if (!res.ok) {
      setEnabled(!on);
      toast.error("Kaydedilemedi");
    }
  };

  const copy = async () => {
    const text = JSON.stringify(logs, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopyalanamadı");
    }
  };

  const okCount = logs.filter((l) => l.kind === "attempt" && l.ok).length;
  const failCount = logs.filter((l) => l.kind === "attempt" && !l.ok).length;
  const learned = logs.some((l) => l.kind === "learned" && l.responseState === "CLOSED");

  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-2 flex items-center gap-2">
        <Send className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm font-semibold">Otomatik &quot;yola çıktı&quot;</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={enabled ?? false}
            disabled={enabled === null}
            onCheckedChange={(v) => void toggle(v === true)}
          />
          {enabled ? "Açık" : "Kapalı"}
        </label>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Kurye &quot;Yola çıktım&quot; deyince kasadaki eklenti Yemeksepeti&apos;ye &quot;yola
        çıktı&quot; gönderir. Deneme aşamasında: tutmazsa aşağıya kaydedilir, kasada elle
        basmak gerekir. Kasada elle basıldığında da eklenti doğru biçimi öğrenir.
      </p>

      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 text-muted-foreground">
          {logs.length === 0
            ? "Henüz kayıt yok."
            : `${okCount} başarılı · ${failCount} başarısız${learned ? " · doğru biçim öğrenildi" : ""}`}
        </span>
        <Button variant="outline" size="sm" className="h-8" onClick={() => void load()}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Yenile
        </Button>
        <Button size="sm" className="h-8" onClick={() => void copy()} disabled={logs.length === 0}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Kopyalandı" : "Kayıtları kopyala"}
        </Button>
      </div>

      {logs.length > 0 && (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border text-xs">
          {logs.map((r) => (
            <li key={r.id} className="flex gap-2 px-3 py-2">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", rowTone(r))} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">{KIND_LABEL[r.kind] ?? r.kind}</span>
                  {r.shortCode && <span className="tabular-nums">#{r.shortCode}</span>}
                  {r.kind === "attempt" && (
                    <span className={r.ok ? "text-emerald-600" : "text-rose-600"}>
                      {r.ok ? "başarılı" : "başarısız"}
                    </span>
                  )}
                  <span className="ml-auto tabular-nums text-muted-foreground">{timeLabel(r.at)}</span>
                </p>
                {(r.note || r.httpStatus != null || r.responseState) && (
                  <p className="text-muted-foreground">
                    {[
                      r.note,
                      r.httpStatus != null ? `HTTP ${r.httpStatus}` : null,
                      r.responseState ? `durum: ${r.responseState}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {r.requestBody && (
                  <p className="mt-0.5 break-all font-mono text-[11px] text-foreground/80">{r.requestBody}</p>
                )}
                {r.responseInfo && (
                  <p className="mt-0.5 break-all text-[11px] text-rose-600">{r.responseInfo}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
