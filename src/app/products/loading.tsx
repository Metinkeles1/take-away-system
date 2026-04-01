import { Skeleton } from "@/components/ui/skeleton";

export default function ProductsLoading() {
  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-4 pb-4 overflow-hidden">
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Menü Yönetimi</h1>
          <Skeleton className="mt-1 h-4 w-36" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <Skeleton className="mb-4 h-10 w-full rounded-md shrink-0" />

      <div className="flex gap-2 flex-wrap mb-4 shrink-0">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pt-px px-px pb-2">
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="rounded-lg border p-4 flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-5 w-16" />
              <div className="flex gap-1">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
