import { useEffect, useMemo, useState } from "react";
import { saveCategoryOptions } from "@/actions/menuOptions";
import type { CategoryOptions, ItemOptionGroup, ProductCategory } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { newOptionId } from "@/lib/orders/itemOptions";
import { useMenuStore } from "@/store/menuStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

interface CategoryOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: CategoryOptions | null;
  onSaved: (next: CategoryOptions) => void;
}

// Kategori seçeneklerini düzenleme: her kategoride gruplar (Acı, Pişme,
// İstekler…), grupta seçenekler ve isteğe bağlı ek ücret. Kategoriler
// arasında gezinirken değişiklikler tutulur; Kaydet hepsini birden yazar.
export function CategoryOptionsDialog({
  open,
  onOpenChange,
  options,
  onSaved,
}: CategoryOptionsDialogProps) {
  const [draft, setDraft] = useState<CategoryOptions | null>(options);
  const [active, setActive] = useState<ProductCategory>("kebap");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(options);
  }, [open, options]);

  const dirty = useMemo(() => {
    if (!draft || !options) return [] as ProductCategory[];
    return MENU_CATEGORIES.map((c) => c.value).filter(
      (c) => JSON.stringify(draft[c]) !== JSON.stringify(options[c]),
    );
  }, [draft, options]);

  const groups = draft?.[active] ?? [];
  const setGroups = (fn: (g: ItemOptionGroup[]) => ItemOptionGroup[]) =>
    setDraft((d) => (d ? { ...d, [active]: fn(d[active] ?? []) } : d));
  const patchGroup = (gi: number, patch: Partial<ItemOptionGroup>) =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const moveGroup = (gi: number, dir: -1 | 1) =>
    setGroups((gs) => {
      const j = gi + dir;
      if (j < 0 || j >= gs.length) return gs;
      const next = [...gs];
      [next[gi], next[j]] = [next[j], next[gi]];
      return next;
    });

  const handleSave = async () => {
    if (!draft || dirty.length === 0) return;
    setIsSaving(true);
    try {
      const next = { ...draft };
      for (const c of dirty) next[c] = await saveCategoryOptions(c, draft[c]);
      // Sipariş ekranı menü önbelleğinden okur — anında güncel olsun
      useMenuStore.setState({ categoryOptions: next });
      onSaved(next);
      toast.success("Seçenekler kaydedildi");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Ürün Seçenekleri</DialogTitle>
          <DialogDescription>
            Sepette ürüne eklenen istekler. Ücret yazılan seçenek fiyata eklenir (porsiyondan
            bağımsız). <b>Tek seçim</b> grubunda biri seçilince diğeri kalkar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 shrink-0">
          {MENU_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setActive(c.value)}
              className={cn(
                "relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors cursor-pointer",
                active === c.value
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-card ring-foreground/15 hover:bg-muted",
              )}
            >
              {c.emoji} {c.label}
              {dirty.includes(c.value) && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 -mx-1 px-1">
          {!draft ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {groups.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Bu kategoride seçenek yok.
                </p>
              )}
              {groups.map((g, gi) => (
                <div key={g.id} className="rounded-lg ring-1 ring-foreground/10 bg-card/40 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={g.name}
                      onChange={(e) => patchGroup(gi, { name: e.target.value })}
                      placeholder="Grup adı (ör. Acı)"
                      className="h-8 flex-1 min-w-32 text-sm font-medium"
                    />
                    <div className="flex rounded-md ring-1 ring-foreground/15 overflow-hidden text-xs">
                      {(["single", "multi"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => patchGroup(gi, { mode: m })}
                          className={cn(
                            "px-2.5 py-1.5 cursor-pointer",
                            g.mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                          )}
                        >
                          {m === "single" ? "Tek seçim" : "Çoklu"}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center">
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={gi === 0} onClick={() => moveGroup(gi, -1)} title="Yukarı">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, 1)} title="Aşağı">
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))}
                        title="Grubu sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {g.options.map((o, oi) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <Input
                          value={o.label}
                          onChange={(e) =>
                            patchGroup(gi, {
                              options: g.options.map((x, i) => (i === oi ? { ...x, label: e.target.value } : x)),
                            })
                          }
                          placeholder="Seçenek (ör. Yumurtalı)"
                          className="h-8 flex-1 text-sm"
                        />
                        <div className="relative w-24 shrink-0">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            +₺
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={o.price || ""}
                            placeholder="0"
                            onChange={(e) =>
                              patchGroup(gi, {
                                options: g.options.map((x, i) =>
                                  i === oi ? { ...x, price: Number(e.target.value) || 0 } : x,
                                ),
                              })
                            }
                            className="h-8 pl-8 text-sm tabular-nums"
                          />
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => patchGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}
                          title="Seçeneği sil"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-primary"
                      onClick={() =>
                        patchGroup(gi, {
                          options: [...g.options, { id: newOptionId(), label: "", price: 0 }],
                        })
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Seçenek ekle
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() =>
                  setGroups((gs) => [
                    ...gs,
                    {
                      id: newOptionId(),
                      name: "",
                      mode: "multi",
                      options: [{ id: newOptionId(), label: "", price: 0 }],
                    },
                  ])
                }
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Grup ekle
              </Button>
            </>
          )}
        </div>

        <DialogFooter className="items-center">
          {dirty.length > 0 && (
            <span className="mr-auto text-xs text-amber-600">
              {dirty.length} kategoride kaydedilmemiş değişiklik
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={handleSave} disabled={isSaving || dirty.length === 0}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
