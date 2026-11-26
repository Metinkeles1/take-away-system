"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChefHat, Loader2, Plus, Printer, Trash2 } from "lucide-react";

import {
  getStationSettings,
  saveStationSettings,
  testStation,
  type StationSettings,
} from "@/actions/printStations";
import { MAX_STATIONS, type PrintStation, type PrintStationConfig } from "@/lib/printAgent/stationTypes";
import { Switch } from "@/components/settings/TrendyolPrintAgentCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const selectCls = "h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm";

// Mutfak istasyonları: siparişin kebapları ocakbaşı yazıcısından, pide/lahmacun
// fırın yazıcısından… Kasa fişi aynen devam eder. Fişleri kasa programı basar.
export function StationPrintCard() {
  const [data, setData] = useState<StationSettings | null>(null);
  const [draft, setDraft] = useState<PrintStationConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getStationSettings();
      setData(s);
      setDraft(s.config);
    } catch (err) {
      console.warn("[station settings]", err);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getStationSettings()
      .then((s) => {
        if (!alive) return;
        setData(s);
        setDraft(s.config);
      })
      .catch((err) => console.warn("[station settings]", err));
    return () => {
      alive = false;
    };
  }, []);

  const dirty = useMemo(
    () => !!data && !!draft && JSON.stringify(data.config) !== JSON.stringify(draft),
    [data, draft],
  );

  const save = useCallback(
    async (next: PrintStationConfig, key: string, okText: string) => {
      setBusy(key);
      const res = await saveStationSettings(next).catch(() => ({ ok: false, error: undefined }));
      setBusy(null);
      if (res.ok) {
        toast.success(okText);
        await load();
      } else toast.error(res.error ?? "Kaydedilemedi");
    },
    [load],
  );

  if (!data || !draft) {
    return (
      <section className="mb-8">
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Mutfak istasyonları yükleniyor…
          </CardContent>
        </Card>
      </section>
    );
  }

  const setStation = (id: string, patch: Partial<PrintStation>) =>
    setDraft({ ...draft, stations: draft.stations.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  // Kategori yalnız bir istasyonda: seçilince diğerinden çıkar.
  const toggleCategory = (id: string, cat: string) =>
    setDraft({
      ...draft,
      stations: draft.stations.map((s) =>
        s.id === id
          ? {
              ...s,
              categories: s.categories.includes(cat)
                ? s.categories.filter((c) => c !== cat)
                : [...s.categories, cat],
            }
          : { ...s, categories: s.categories.filter((c) => c !== cat) },
      ),
    });

  const addStation = () => {
    const used = new Set(draft.stations.map((s) => s.id));
    let n = draft.stations.length + 1;
    while (used.has(`st${n}`)) n++;
    setDraft({
      ...draft,
      stations: [...draft.stations, { id: `st${n}`, name: "", categories: [], deviceId: "", printerName: "" }],
    });
  };

  const removeStation = (id: string) =>
    setDraft({
      ...draft,
      stations: draft.stations.filter((s) => s.id !== id),
      fallbackStationId: draft.fallbackStationId === id ? "" : draft.fallbackStationId,
    });

  const ownerOf = new Map(draft.stations.flatMap((s) => s.categories.map((c) => [c, s.name || "?"] as const)));
  const ready = draft.stations.filter((s) => s.deviceId).length;
  const savedIds = new Set(data.config.stations.map((s) => s.id));

  return (
    <section className="mb-8">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
              <ChefHat className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Mutfak İstasyonları</p>
              <p className="text-xs text-muted-foreground">
                Açıkken siparişin ürünleri kategorisine göre bölünür: kebaplar ocakbaşı yazıcısından,
                pide/lahmacun fırın yazıcısından çıkar. Kasa fişi aynen basılmaya devam eder.
              </p>
            </div>
            <Switch
              on={draft.enabled}
              busy={busy === "enabled"}
              label="İstasyona göre fiş ayır"
              onToggle={() =>
                void save(
                  { ...draft, enabled: !draft.enabled },
                  "enabled",
                  draft.enabled ? "İstasyon fişleri kapatıldı" : "İstasyon fişleri açıldı",
                )
              }
            />
          </div>

          <div className="mb-4 rounded-lg bg-muted px-3 py-2 text-xs">
            {data.config.enabled
              ? ready === 0
                ? "Açık ama hiçbir istasyona bilgisayar seçilmedi — istasyon fişi çıkmıyor."
                : "Açık · Trendyol, Yemeksepeti ve panelde “Tamamla + Yazdır” denen siparişler istasyonlara bölünüyor."
              : "Kapalı — her sipariş bugünkü gibi tek fiş."}
            {dirty && <span className="mt-1 block font-medium text-amber-700">Kaydedilmemiş değişiklik var.</span>}
          </div>

          {data.devices.length === 0 && (
            <p className="mb-4 text-xs text-amber-700">
              İstasyon fişlerini kasa programı basar. Önce yukarıdaki “Trendyol Otomatik Kabul ve
              Yazıcı” bölümünden programı yazıcının bağlı olduğu bilgisayara kurun. Tek bilgisayara
              iki yazıcı bağlanabilir.
            </p>
          )}

          <ul className="mb-3 space-y-3">
            {draft.stations.map((s) => {
              const device = data.devices.find((d) => d.deviceId === s.deviceId);
              const printers =
                s.printerName && device && !device.printers.includes(s.printerName)
                  ? [...device.printers, s.printerName]
                  : (device?.printers ?? []);
              return (
                <li key={s.id} className="rounded-lg border p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <Input
                      value={s.name}
                      maxLength={24}
                      placeholder="İstasyon adı (ör. Ocakbaşı)"
                      onChange={(e) => setStation(s.id, { name: e.target.value })}
                      className="h-9"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-rose-600"
                      onClick={() => removeStation(s.id)}
                      aria-label={`${s.name || "İstasyon"} sil`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="mb-1.5 text-xs text-muted-foreground">Bu istasyona giden kategoriler</p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {data.categories.map((c) => {
                      const mine = s.categories.includes(c.value);
                      const other = !mine ? ownerOf.get(c.value) : undefined;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => toggleCategory(s.id, c.value)}
                          title={other ? `Şu an: ${other} — tıklarsanız buraya taşınır` : undefined}
                          className={
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                            (mine
                              ? "border-orange-500 bg-orange-500 text-white"
                              : other
                                ? "text-muted-foreground/60 hover:bg-muted"
                                : "hover:bg-muted")
                          }
                        >
                          {c.emoji} {c.label}
                          {other ? ` · ${other}` : ""}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={s.deviceId}
                      onChange={(e) => setStation(s.id, { deviceId: e.target.value, printerName: "" })}
                      className={selectCls}
                      aria-label={`${s.name} bilgisayar`}
                    >
                      <option value="">Bilgisayar seçin…</option>
                      {data.devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.host}
                          {d.online ? "" : " (kapalı)"}
                        </option>
                      ))}
                    </select>
                    <select
                      value={s.printerName}
                      disabled={!device}
                      onChange={(e) => setStation(s.id, { printerName: e.target.value })}
                      className={selectCls}
                      aria-label={`${s.name} yazıcı`}
                    >
                      <option value="">Bilgisayarın fiş yazıcısı (otomatik)</option>
                      {printers.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={dirty || !savedIds.has(s.id) || !s.deviceId || busy === `test:${s.id}`}
                      title={dirty ? "Önce kaydedin" : undefined}
                      onClick={async () => {
                        setBusy(`test:${s.id}`);
                        const r = await testStation(s.id).catch(() => ({ ok: false, error: undefined }));
                        setBusy(null);
                        if (r.ok) toast.success("Deneme fişi 20 sn içinde basılır");
                        else toast.error(r.error ?? "Gönderilemedi");
                      }}
                    >
                      {busy === `test:${s.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4" />
                      )}
                      Deneme fişi
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {draft.stations.length < MAX_STATIONS && (
            <Button variant="outline" size="sm" className="mb-4" onClick={addStation}>
              <Plus className="h-4 w-4" />
              İstasyon ekle
            </Button>
          )}

          <div className="mb-4">
            <p className="mb-1.5 text-xs text-muted-foreground">
              Trendyol / Yemeksepeti ürünü menüde bulunamazsa (adı farklıysa) fişi nereye gitsin?
            </p>
            <select
              value={draft.fallbackStationId}
              onChange={(e) => setDraft({ ...draft, fallbackStationId: e.target.value })}
              className={selectCls + " w-full"}
              aria-label="Eşleşmeyen ürünler"
            >
              <option value="">Hiçbirine (yalnız kasa fişinde)</option>
              {draft.stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || "İsimsiz istasyon"} — “(?)” işaretiyle
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!dirty || busy === "save"}
              onClick={() => void save(draft, "save", "İstasyonlar kaydedildi")}
            >
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Kaydet
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(data.config)}>
                Vazgeç
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
