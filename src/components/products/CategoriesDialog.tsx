"use client";

import { useEffect, useMemo, useState } from "react";
import type { MenuCategory, Product } from "@/types";
import {
  addMenuCategory,
  deleteMenuCategory,
  reorderMenuCategories,
  updateMenuCategory,
} from "@/actions/menuCategories";
import { useCategoryStore, useMenuCategories } from "@/store/categoryStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const EMOJI_SUGGESTIONS = ["🍽️", "🥗", "🍔", "🍟", "🌮", "🍗", "🐟", "🍚", "🍝", "🥪", "🧆", "🥞", "🍮", "☕", "🧃", "🍺"];

interface CategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Pick<Product, "category">[];
}

// Menü kategorileri: ekle, adını/emojisini değiştir, sırala, boş olanı sil.
// Her işlem anında kaydedilir; sıralama menü ve sipariş ekranındaki sırayı belirler.
export function CategoriesDialog({ open, onOpenChange, products }: CategoriesDialogProps) {
  const categories = useMenuCategories();
  const setCategories = useCategoryStore((s) => s.setCategories);
  const [busy, setBusy] = useState<string | null>(null); // işlem yapılan satır / "add"
  const [newLabel, setNewLabel] = useState("");
  const [newEmoji, setNewEmoji] = useState("🍽️");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNewLabel("");
      setNewEmoji("🍽️");
      setConfirmDelete(null);
    }
  }, [open]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [products]);

  const run = async (key: string, fn: () => Promise<MenuCategory[]>, ok?: string) => {
    setBusy(key);
    try {
      setCategories(await fn());
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaydedilemedi");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) return;
    const done = await run("add", () => addMenuCategory(label, newEmoji), `"${label}" eklendi`);
    if (done) {
      setNewLabel("");
      setNewEmoji("🍽️");
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= categories.length) return;
    const values = categories.map((c) => c.value);
    [values[i], values[j]] = [values[j], values[i]];
    void run(categories[i].value, () => reorderMenuCategories(values));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Kategoriler</DialogTitle>
          <DialogDescription>
            Yeni kategori ekleyin, adını değiştirin veya sırasını ayarlayın. Sıra, menüde ve
            sipariş ekranında aynen görünür. İçinde ürün olan kategori silinemez.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 -mx-1 px-1">
          {categories.map((c, i) => (
            <CategoryRow
              // Ad/emoji sunucuda değişince satır yeniden kurulur, taslak güncel değerle başlar
              key={`${c.value}|${c.label}|${c.emoji}`}
              category={c}
              count={counts.get(c.value) ?? 0}
              busy={busy === c.value}
              disabled={busy !== null}
              isFirst={i === 0}
              isLast={i === categories.length - 1}
              confirmingDelete={confirmDelete === c.value}
              onMove={(dir) => move(i, dir)}
              onSave={(label, emoji) =>
                run(c.value, () => updateMenuCategory(c.value, { label, emoji }), "Kategori güncellendi")
              }
              onDelete={() => {
                if (confirmDelete !== c.value) {
                  setConfirmDelete(c.value);
                  return;
                }
                setConfirmDelete(null);
                void run(c.value, () => deleteMenuCategory(c.value), `"${c.label}" silindi`);
              }}
            />
          ))}
        </div>

        {/* Yeni kategori */}
        <div className="shrink-0 rounded-lg bg-muted/50 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Yeni kategori</p>
          <div className="flex gap-2">
            <Input
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value)}
              className="h-9 w-14 shrink-0 text-center text-lg px-1"
              aria-label="Emoji"
            />
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
              placeholder="Kategori adı (ör. Salata)"
              maxLength={30}
              className="h-9 flex-1 min-w-0"
            />
            <Button className="h-9 shrink-0" onClick={handleAdd} disabled={!newLabel.trim() || busy !== null}>
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1">Ekle</span>
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {EMOJI_SUGGESTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setNewEmoji(e)}
                className={cn(
                  "h-8 w-8 rounded-md text-lg cursor-pointer transition-colors",
                  newEmoji === e ? "bg-primary/15 ring-1 ring-primary" : "hover:bg-muted",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CategoryRowProps {
  category: MenuCategory;
  count: number;
  busy: boolean;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  confirmingDelete: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (label: string, emoji: string) => Promise<boolean>;
  onDelete: () => void;
}

function CategoryRow({
  category,
  count,
  busy,
  disabled,
  isFirst,
  isLast,
  confirmingDelete,
  onMove,
  onSave,
  onDelete,
}: CategoryRowProps) {
  const [label, setLabel] = useState(category.label);
  const [emoji, setEmoji] = useState(category.emoji);

  const dirty = label.trim() !== category.label || emoji.trim() !== category.emoji;
  const save = () => {
    if (dirty && label.trim()) void onSave(label, emoji);
  };

  return (
    <div className="flex items-center gap-1.5 rounded-lg ring-1 ring-foreground/10 bg-card p-1.5">
      <Input
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="h-8 w-11 shrink-0 text-center text-base px-1"
        aria-label="Emoji"
      />
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        maxLength={30}
        className="h-8 flex-1 min-w-0 text-sm"
        aria-label="Kategori adı"
      />
      <span
        className="shrink-0 w-14 text-right text-xs tabular-nums text-muted-foreground"
        title="Bu kategorideki ürün sayısı"
      >
        {count} ürün
      </span>
      {dirty ? (
        <Button size="icon" className="h-8 w-8 shrink-0" onClick={save} disabled={disabled || !label.trim()} title="Kaydet">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
      ) : (
        <div className="flex shrink-0 items-center">
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || isFirst} onClick={() => onMove(-1)} title="Yukarı">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || isLast} onClick={() => onMove(1)} title="Aşağı">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            size={confirmingDelete ? "sm" : "icon"}
            variant={confirmingDelete ? "destructive" : "ghost"}
            className={cn("h-8", confirmingDelete ? "px-2 text-xs" : "w-8 text-muted-foreground hover:text-destructive")}
            disabled={disabled || count > 0}
            onClick={onDelete}
            title={count > 0 ? "İçinde ürün var — önce ürünleri taşıyın" : "Kategoriyi sil"}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmingDelete ? "Sil?" : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
