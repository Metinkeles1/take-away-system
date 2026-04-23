import { Button } from "@/components/ui/button";
import { Download, Plus } from "lucide-react";

interface ProductsHeaderProps {
  totalProducts: number;
  activeProducts: number;
  onExportCSV: () => void;
  onAddProduct: () => void;
}

export function ProductsHeader({
  totalProducts,
  activeProducts,
  onExportCSV,
  onAddProduct,
}: ProductsHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between shrink-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Menü Yönetimi</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Toplam {totalProducts} ürün · {activeProducts} aktif
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onExportCSV}>
          <Download className="mr-2 h-4 w-4" />
          CSV
        </Button>
        <Button onClick={onAddProduct}>
          <Plus className="mr-2 h-4 w-4" />
          Yeni Ürün
        </Button>
      </div>
    </div>
  );
}
