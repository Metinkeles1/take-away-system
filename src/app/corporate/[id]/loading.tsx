import { Skeleton } from "@/components/ui/skeleton";

export default function CorporateDetailLoading() {
  return (
    <main className="h-full flex flex-col px-4 pt-4 pb-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      {/* Header — gerçek layout: sm'de yan yana, mobilde alt alta */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 shrink-0">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-56 sm:w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <Skeleton className="h-9 flex-1 sm:flex-none sm:w-44" />
          <Skeleton className="h-9 w-9 sm:w-28" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 shrink-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>

      {/* Action bar — mobilde ikon-only butonlar (sm:w-32-40 desktop'ta metinli) */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mb-3 shrink-0">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          <Skeleton className="h-8 w-9 sm:w-32" />
          <Skeleton className="h-8 w-9 sm:w-36" />
          <Skeleton className="h-8 w-9 sm:w-40" />
        </div>
      </div>

      {/* Voucher list */}
      <div className="flex-1 min-h-0 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border p-3 flex items-center gap-3"
          >
            <Skeleton className="hidden sm:block h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </main>
  );
}
