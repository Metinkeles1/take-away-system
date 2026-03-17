import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function OrderDetailLoading() {
  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-4 pb-4 overflow-hidden">
      {/* Başlık */}
      <div className="mb-4 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="sm" disabled>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Geri
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <Skeleton className="mt-1 h-4 w-40" />
        </div>
        <Button variant="outline" disabled>
          <Printer className="mr-2 h-4 w-4" />
          Fişi Yazdır
        </Button>
      </div>

      {/* İki sütun */}
      <div className="flex-1 min-h-0 flex gap-6">
        {/* Sol: Detay kartları */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide pt-px px-px pb-4 space-y-4">
          {/* Durum kartı */}
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-56 rounded-md" />
            </CardContent>
          </Card>

          {/* Ürünler kartı */}
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
                  >
                    <Skeleton className="h-4 w-32" />
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
              <Separator className="my-3" />
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Separator />
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Müşteri kartı */}
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 ${i === 2 ? "sm:col-span-2" : ""}`}
                >
                  <Skeleton className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Ödeme kartı */}
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-16" />
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-28" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sağ: Fiş önizleme skeleton */}
        <div className="hidden lg:flex flex-col w-72 shrink-0 pt-px pb-4">
          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader className="pb-2 shrink-0">
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-3 space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <Separator />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
              <Separator />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            </CardContent>
          </Card>
          <Skeleton className="mt-3 h-10 w-full rounded-md" />
        </div>
      </div>
    </main>
  );
}
