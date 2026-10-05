import { type CategoryOptions, type ProductCategory } from "@/types";
import { DEFAULT_CATEGORY_OPTIONS } from "@/lib/orders/itemOptions";
import { cn } from "@/lib/utils";
import { MENU_CATEGORIES } from "@/data/menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductImageField } from "./ProductImageField";

export interface ProductFormState {
  name: string;
  price: string;
  category: ProductCategory;
  description: string;
  available: boolean;
  portionable: boolean;
  hiddenOptions: string[]; // bu üründe gizlenen kategori seçenekleri (id)
  imageUrl: string;
  imageFile: File | null;
}

// Kategori değiştiyse eski kategorinin gizli seçenekleri anlamsız kalır —
// yalnız ürünün kategorisinde var olan id'ler kaydedilir.
export function keepCategoryOptionIds(
  form: Pick<ProductFormState, "category" | "hiddenOptions">,
  categoryOptions: CategoryOptions | null,
): string[] {
  const groups = (categoryOptions ?? DEFAULT_CATEGORY_OPTIONS)[form.category] ?? [];
  const ids = new Set(groups.flatMap((g) => g.options.map((o) => o.id)));
  return form.hiddenOptions.filter((id) => ids.has(id));
}

interface ProductFormFieldsProps {
  formData: ProductFormState;
  setFormData: React.Dispatch<React.SetStateAction<ProductFormState>>;
  categoryOptions: CategoryOptions | null;
}

export function ProductFormFields({
  formData,
  setFormData,
  categoryOptions,
}: ProductFormFieldsProps) {
  const groups = (categoryOptions ?? DEFAULT_CATEGORY_OPTIONS)[formData.category] ?? [];
  const hidden = new Set(formData.hiddenOptions);
  const toggleHidden = (id: string) =>
    setFormData((p) => ({
      ...p,
      hiddenOptions: hidden.has(id)
        ? p.hiddenOptions.filter((x) => x !== id)
        : [...p.hiddenOptions, id],
    }));

  return (
    <div className="grid gap-4 py-2">
      <ProductImageField
        imageUrl={formData.imageUrl}
        imageFile={formData.imageFile}
        onChange={({ imageUrl, imageFile }) =>
          setFormData((p) => ({ ...p, imageUrl, imageFile }))
        }
      />

      <div className="grid gap-2">
        <Label htmlFor="product-name">Ürün Adı *</Label>
        <Input
          id="product-name"
          placeholder="Ürün adı"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="product-price">Fiyat (₺) *</Label>
          <Input
            id="product-price"
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={formData.price}
            onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <Label>Kategori *</Label>
          <Select
            value={formData.category}
            onValueChange={(v) =>
              setFormData((p) => ({ ...p, category: v as ProductCategory }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MENU_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.emoji} {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="product-desc">Açıklama</Label>
        <Input
          id="product-desc"
          placeholder="Opsiyonel açıklama"
          value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
        />
      </div>

      <label
        htmlFor="product-portionable"
        className="flex items-start gap-3 rounded-lg ring-1 ring-foreground/10 bg-card/40 p-3 cursor-pointer hover:bg-card/60 transition-colors"
      >
        <Checkbox
          id="product-portionable"
          checked={formData.portionable}
          onCheckedChange={(v) =>
            setFormData((p) => ({ ...p, portionable: v === true }))
          }
          className="mt-0.5"
        />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium">Porsiyon seçeneği sun</span>
          <span className="text-[12px] text-muted-foreground leading-tight">
            Sipariş ekranında ½ / 1 / 1½ porsiyon seçenekleri gösterilir
            (yarım fiyat = ½, bir buçuk = 1.5×).
          </span>
        </div>
      </label>

      {groups.length > 0 && (
        <div className="grid gap-2 rounded-lg ring-1 ring-foreground/10 bg-card/40 p-3">
          <div>
            <span className="text-sm font-medium">Sepette sunulan seçenekler</span>
            <p className="text-[12px] text-muted-foreground leading-tight">
              Kategoriden gelir. Bu ürüne uymayanın üstüne dokunup kapat (ör. kaşarlı
              pidede &quot;Yumurtasız&quot;). Listeyi &quot;Seçenekler&quot; butonundan düzenle.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {groups.flatMap((g) =>
              g.options.map((o) => {
                const off = hidden.has(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={!off}
                    onClick={() => toggleHidden(o.id)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors cursor-pointer",
                      off
                        ? "bg-muted text-muted-foreground/60 ring-foreground/10 line-through"
                        : "bg-primary/10 text-primary ring-primary/30",
                    )}
                  >
                    {o.label}
                    {o.price > 0 && <span className="ml-1 tabular-nums">+{o.price}₺</span>}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
