"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Check, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { callCouriers, getCourierPushStatus, type CourierPushStatus } from "@/actions/courierPush";
import { cn } from "@/lib/utils";
import { useWide } from "./CourierPanel";

// Kurye çağır — panelden seçilen kuryelerin telefonuna bildirim (Web Push).
// Yalnız aktif kuryeler listelenir; bildirimi açmamış kurye seçilemez (gri).
// Telefonda alttan, geniş ekranda sağdan açılır (CourierPanel ile aynı).

const PRESETS = ["Paketler hazır, mutfağa gel", "Acil, hemen gel", "Kasaya uğra"] as const;

export function CallCourierSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const wide = useWide();
  const [list, setList] = useState<CourierPushStatus[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<string>(PRESETS[0]);
  const [custom, setCustom] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCourierPushStatus();
      setConfigured(res.configured);
      setList(res.couriers);
      // Varsayılan: bildirimi açık herkes seçili. Önceki seçim varsa korunur.
      setSelected((prev) => {
        const reachable = res.couriers.filter((c) => c.devices > 0).map((c) => c.name);
        const kept = reachable.filter((n) => prev.has(n));
        return new Set(kept.length ? kept : reachable);
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const reachable = (list ?? []).filter((c) => c.devices > 0);
  const allSelected = reachable.length > 0 && reachable.every((c) => selected.has(c.name));
  const message = custom.trim() || preset;

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const send = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await callCouriers([...selected], message);
      if (!res.ok) {
        toast.error(res.error ?? "Bildirim gönderilemedi");
        return;
      }
      const sent = res.sentCouriers ?? [];
      const failed = res.failedCouriers ?? [];
      toast.success(sent.length === 1 ? `${sent[0]} çağrıldı` : `${sent.length} kurye çağrıldı`, {
        description: failed.length ? `Ulaşılamadı: ${failed.join(", ")}` : sent.length > 1 ? sent.join(", ") : undefined,
      });
      onOpenChange(false);
      if (failed.length) void load();
    } catch {
      toast.error("Bildirim gönderilemedi");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? "right" : "bottom"}
        className={cn("gap-0 p-0", wide ? "w-full sm:max-w-md" : "max-h-[90dvh] rounded-t-2xl")}
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2">
            <BellRing className="size-4" />
            Kurye çağır
          </SheetTitle>
          <SheetDescription>Seçtiğin kuryelerin telefonu titrer ve bildirim düşer.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {!configured && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              Bildirim anahtarları tanımlı değil (VAPID). Vercel ortam değişkenlerine eklenmeli.
            </p>
          )}

          {/* Mesaj */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mesaj</h3>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPreset(p);
                    setCustom("");
                  }}
                  className={cn(
                    "rounded-full border px-3 py-2 text-sm font-medium transition-colors lg:py-1.5",
                    !custom.trim() && preset === p
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={120}
              placeholder="ya da kendi mesajını yaz…"
              className="h-11 lg:h-9"
            />
          </section>

          {/* Kuryeler */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kuryeler</h3>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Listeyi yenile"
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              </button>
              {reachable.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelected(allSelected ? new Set() : new Set(reachable.map((c) => c.name)))}
                  className="ml-auto text-xs font-medium text-primary hover:underline"
                >
                  {allSelected ? "Hiçbirini seçme" : "Hepsini seç"}
                </button>
              )}
            </div>

            {list === null ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : list.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aktif kurye yok. Ayarlar’dan ekleyebilirsin.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border">
                {list.map((c) => {
                  const enabled = c.devices > 0;
                  const on = selected.has(c.name);
                  return (
                    <li key={c.name}>
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => toggle(c.name)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                          enabled ? "hover:bg-muted/60" : "cursor-not-allowed opacity-60",
                          on && "bg-primary/5",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-md border",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                          )}
                        >
                          {on && <Check className="size-3.5" />}
                        </span>
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">
                          {c.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                        {enabled ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <BellRing className="size-3" />
                            Açık{c.devices > 1 ? ` · ${c.devices} cihaz` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            <BellOff className="size-3" />
                            Kapalı
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {list && list.some((c) => c.devices === 0) && (
              <p className="text-xs text-muted-foreground">
                “Kapalı” kuryeler, kurye ekranında üstteki zil simgesinden bildirimi açmalı.
              </p>
            )}
          </section>
        </div>

        <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            className="h-12 w-full text-base lg:h-10 lg:text-sm"
            disabled={sending || selected.size === 0 || !configured}
            onClick={() => void send()}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {selected.size === 0
              ? "Kurye seç"
              : selected.size === 1
                ? `${[...selected][0]} çağır`
                : `${selected.size} kuryeyi çağır`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
