"use client";

// Kampanya ayarları paneli: mağazanın bulunduğu grup, o grubun normal ve flaş
// kademeleri, komisyon oranı. Sunucuya (Setting koleksiyonu) kaydedilir;
// menü ve Kampanyalar sayfası aynı veriyi kullanır. Altta sepet hesaplayıcı
// girilen kademelerin nasıl uygulandığını kaydetmeden önce gösterir.

import { useMemo, useState } from "react";
import { Calculator, Loader2, Plus, RotateCcw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  resetCampaignSettings,
  saveCampaignSettings,
  type CampaignSettings,
} from "@/actions/trendyolCampaignSettings";
import type { CampaignGroup } from "@/lib/trendyolCampaigns";
import { cn } from "@/lib/utils";
import { breakdown, formatTl, parseAmount } from "./pricing";

type Row = { min: string; discount: string };
type DraftGroup = { id: number; tiers: Row[]; flash: Row[] };

const toRows = (ts: { min: number; discount: number }[]): Row[] =>
  ts.map((t) => ({ min: String(t.min).replace(".", ","), discount: String(t.discount).replace(".", ",") }));

// Satır hatası: boş satır hata sayılmaz (kaydederken atılır).
function rowError(row: Row, all: Row[]): string | null {
  if (!row.min.trim() && !row.discount.trim()) return null;
  const min = parseAmount(row.min);
  const discount = parseAmount(row.discount);
  if (!(min > 0)) return "Sepet tutarı girin";
  if (!(discount > 0)) return "İndirim girin";
  if (discount >= min) return "İndirim sepet tutarından küçük olmalı";
  if (all.filter((r) => parseAmount(r.min) === min).length > 1) return "Aynı tutar iki kez yazılmış";
  return null;
}

function toTiers(rows: Row[]) {
  return rows
    .filter((r) => r.min.trim() || r.discount.trim())
    .map((r) => ({ min: parseAmount(r.min), discount: parseAmount(r.discount) }))
    .sort((a, b) => a.min - b.min);
}

export function CampaignSettingsSheet({
  open,
  onOpenChange,
  settings,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: CampaignSettings;
  onSaved: (s: CampaignSettings) => void;
}) {
  // Taslak kayıtlı değerlerden kurulur; üst bileşen panel her açıldığında
  // key değiştirerek bileşeni yeniden oluşturur (taze taslak).
  const [groups, setGroups] = useState<DraftGroup[]>(() =>
    settings.groups.map((g) => ({ id: g.id, tiers: toRows(g.tiers), flash: toRows(g.flash) })),
  );
  const [groupId, setGroupId] = useState(settings.activeGroupId);
  const [rate, setRate] = useState(() =>
    String(Math.round(settings.commissionRate * 10000) / 100).replace(".", ","),
  );
  const [basket, setBasket] = useState("300");
  const [saving, setSaving] = useState(false);

  const current = groups.find((g) => g.id === groupId);
  const ratePct = parseAmount(rate);
  const rateError = !(ratePct >= 0 && ratePct < 100) ? "0–99 arası bir oran girin" : null;

  const hasErrors =
    !!rateError ||
    groups.some((g) =>
      [...g.tiers.map((r) => rowError(r, g.tiers)), ...g.flash.map((r) => rowError(r, g.flash))].some(Boolean),
    );

  const previewGroup: CampaignGroup | null = useMemo(() => {
    if (!current) return null;
    const ok = (rows: Row[]) => toTiers(rows.filter((r) => !rowError(r, rows)));
    return { id: current.id, tiers: ok(current.tiers), flash: ok(current.flash) };
  }, [current]);

  const updateRows = (kind: "tiers" | "flash", fn: (rows: Row[]) => Row[]) =>
    setGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, [kind]: fn(g[kind]) } : g)));

  const save = async () => {
    if (hasErrors) {
      toast.error("Kırmızı işaretli alanları düzeltin.");
      return;
    }
    setSaving(true);
    const res = await saveCampaignSettings({
      activeGroupId: groupId,
      commissionRate: ratePct / 100,
      groups: groups.map((g) => ({ id: g.id, tiers: toTiers(g.tiers), flash: toTiers(g.flash) })),
    });
    setSaving(false);
    if (!res.ok || !res.settings) {
      toast.error(res.error ?? "Kaydedilemedi.");
      return;
    }
    onSaved(res.settings);
    toast.success(`Kampanya ayarları kaydedildi · Grup ${groupId}`);
    onOpenChange(false);
  };

  const reset = async () => {
    if (!confirm("Tüm gruplar sözleşme varsayılanlarına dönsün mü?")) return;
    setSaving(true);
    try {
      const s = await resetCampaignSettings();
      onSaved(s);
      toast.success("Varsayılan kademelere dönüldü.");
      onOpenChange(false);
    } catch {
      toast.error("Sıfırlanamadı.");
    } finally {
      setSaving(false);
    }
  };

  const basketAmount = parseAmount(basket);
  const rateValue = rateError ? 0 : ratePct / 100;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Kampanya kademeleri</SheetTitle>
          <SheetDescription>
            Sepet tutarı bir eşiğe ulaşınca o kademenin indirimi uygulanır; kademeler toplanmaz,
            ulaşılan en yüksek olan geçerlidir. Normal ve flaş kademe birleşmez; hangisi
            büyükse o uygulanır.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* Grup seçimi */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Mağazanın grubu</h3>
            <div className="grid grid-cols-5 gap-1.5">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupId(g.id)}
                  className={cn(
                    "rounded-lg border py-2 text-sm font-semibold transition-colors",
                    g.id === groupId
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                  )}
                >
                  {g.id}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Menüdeki indirim ve hakediş hesapları seçili grubun kademeleriyle yapılır.
            </p>
          </section>

          {current && (
            <>
              <TierEditor
                title="Normal kademeler"
                note="Tüm siparişlerde"
                rows={current.tiers}
                onChange={(fn) => updateRows("tiers", fn)}
              />
              <TierEditor
                title="Flaş kademeler"
                note="Normalden büyükse geçerli"
                flash
                rows={current.flash}
                onChange={(fn) => updateRows("flash", fn)}
              />
            </>
          )}

          {/* Komisyon */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Trendyol komisyonu</h3>
            <div className="flex items-center gap-2">
              <AmountInput value={rate} onChange={setRate} suffix="%" invalid={!!rateError} className="w-28" />
              <span className="text-xs text-gray-500">İndirimli tutar üzerinden kesilir.</span>
            </div>
            {rateError && <p className="text-xs text-rose-600">{rateError}</p>}
          </section>

          {/* Sepet hesaplayıcı */}
          {previewGroup && (
            <section className="space-y-3 rounded-xl border bg-gray-50 p-3">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">Deneme: sepet tutarı</h3>
                <AmountInput value={basket} onChange={setBasket} suffix="₺" className="ml-auto w-28" />
              </div>
              {basketAmount > 0 &&
                (() => {
                  const b = breakdown(previewGroup, basketAmount, rateValue);
                  return (
                    <p className="text-sm tabular-nums text-gray-700">
                      {b.discount > 0 ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 font-medium",
                            b.source === "flash" ? "text-violet-700" : "text-orange-700",
                          )}
                        >
                          {b.source === "flash" && <Zap className="h-3.5 w-3.5" />}−{formatTl(b.discount)}
                        </span>
                      ) : (
                        <span className="text-gray-400">indirim yok</span>
                      )}
                      {" · "}öder <b>{formatTl(b.customerPays)}</b>
                      {" · "}hakediş <b className="text-emerald-700">{formatTl(b.payout)}</b>
                    </p>
                  );
                })()}
            </section>
          )}
        </div>

        <SheetFooter className="flex-row border-t">
          <Button variant="ghost" size="sm" onClick={reset} disabled={saving} className="mr-auto gap-1.5 text-gray-500">
            <RotateCcw className="h-3.5 w-3.5" />
            Varsayılan
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button size="sm" onClick={save} disabled={saving || hasErrors} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Kaydet
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function TierEditor({
  title,
  note,
  flash,
  rows,
  onChange,
}: {
  title: string;
  note: string;
  flash?: boolean;
  rows: Row[];
  onChange: (fn: (rows: Row[]) => Row[]) => void;
}) {
  const set = (i: number, key: keyof Row, v: string) =>
    onChange((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          {flash && <Zap className="h-4 w-4 text-violet-600" />}
          {title}
        </h3>
        <span className="text-xs text-gray-500">{note}</span>
      </div>

      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed py-3 text-center text-xs text-gray-400">Kademe yok</p>
      )}

      {rows.map((row, i) => {
        const err = rowError(row, rows);
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <AmountInput value={row.min} onChange={(v) => set(i, "min", v)} suffix="₺" invalid={!!err} className="flex-1" placeholder="Sepet" />
              <span className="shrink-0">ve üzeri →</span>
              <AmountInput
                value={row.discount}
                onChange={(v) => set(i, "discount", v)}
                prefix="−"
                suffix="₺"
                invalid={!!err}
                className="flex-1"
                placeholder="İndirim"
                tone={flash ? "violet" : "orange"}
              />
              <button
                type="button"
                onClick={() => onChange((rs) => rs.filter((_, j) => j !== i))}
                aria-label="Kademeyi sil"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {err && <p className="text-xs text-rose-600">{err}</p>}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChange((rs) => [...rs, { min: "", discount: "" }])}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Kademe ekle
      </button>
    </section>
  );
}

function AmountInput({
  value,
  onChange,
  prefix,
  suffix,
  invalid,
  className,
  placeholder,
  tone,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  invalid?: boolean;
  className?: string;
  placeholder?: string;
  tone?: "violet" | "orange";
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-1 rounded-lg border bg-white px-2.5 transition focus-within:ring-2",
        invalid ? "border-rose-300 focus-within:ring-rose-100" : "border-gray-200 focus-within:border-emerald-400 focus-within:ring-emerald-100",
        className,
      )}
    >
      {prefix && <span className="text-sm text-gray-400">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        className={cn(
          "w-full min-w-0 bg-transparent text-sm font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-gray-300",
          tone === "violet" ? "text-violet-700" : tone === "orange" ? "text-orange-700" : "text-gray-900",
        )}
      />
      {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
    </div>
  );
}
