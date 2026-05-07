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
    <div className="mb-3 flex items-start justify-between gap-3 shrink-0">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Menü Yönetimi</h1>
        <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
          Toplam <span className="font-medium text-foreground">{totalProducts}</span>{" "}
          ürün ·{" "}
          <span className="font-medium text-emerald-600">{activeProducts}</span> aktif
        </p>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Button
          variant="outline"
          size="sm"
          className="sm:h-9 sm:px-4"
          onClick={onExportCSV}
        >
          <Download className="sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">CSV</span>
        </Button>
        <Button size="sm" className="sm:h-9 sm:px-4" onClick={onAddProduct}>
          <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
          <span>Yeni Ürün</span>
        </Button>
      </div>
    </div>
  );
}
