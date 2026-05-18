import { Skeleton } from "@/components/ui/skeleton";

export default function NewVoucherLoading() {
  return (
    <main className="h-full flex flex-col px-3 pt-3 sm:px-4 sm:pt-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      <div className="mb-3 shrink-0 space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-48" />
      </div>

      <div className="flex-1 min-h-0 grid gap-4 lg:gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Product browser */}
        <div className="flex flex-col min-h-0 gap-3">
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        </div>

        {/* Cart panel — sadece lg+ */}
        <div className="hidden lg:flex flex-col gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <div className="flex-1 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </main>
  );
}
