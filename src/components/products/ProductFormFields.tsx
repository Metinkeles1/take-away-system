import { type ProductCategory } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProductFormState {
  name: string;
  price: string;
  category: ProductCategory;
  description: string;
  available: boolean;
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
    </div>
  );
}
