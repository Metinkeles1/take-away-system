import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrdersLoading() {
  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-4 pb-4 overflow-hidden">
      {/* Başlık */}
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Siparişler</h1>
          <Skeleton className="mt-1 h-4 w-28" />
        </div>
        <Button disabled>
          <PlusCircle className="mr-2 h-4 w-4" />
          Yeni Sipariş
        </Button>
      </div>

      {/* Sipariş kartı iskeletleri */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-px px-px pb-2">
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-lg border p-4 flex items-center gap-4">
              {/* Sol: sipariş bilgisi */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>

              {/* Orta: ürün badge'leri */}
              <div className="hidden md:flex flex-1 flex-wrap gap-1">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>

              {/* Sağ: tutar + kontroller */}
              <div className="flex flex-col items-end gap-2">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-8 w-40 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
