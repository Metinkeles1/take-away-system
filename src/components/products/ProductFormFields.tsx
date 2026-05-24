import { type ProductCategory } from "@/types";
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
  imageUrl: string;
  imageFile: File | null;
}

interface ProductFormFieldsProps {
  formData: ProductFormState;
  setFormData: React.Dispatch<React.SetStateAction<ProductFormState>>;
}

export function ProductFormFields({
  formData,
  setFormData,
}: ProductFormFieldsProps) {
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
    </div>
  );
}
