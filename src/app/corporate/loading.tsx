import { Skeleton } from "@/components/ui/skeleton";

export default function CorporateLoading() {
  return (
    <main className="h-full flex flex-col px-4 pt-4 pb-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-44 sm:w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-9 sm:w-32 shrink-0" />
      </div>

      <Skeleton className="mb-4 h-10 w-full shrink-0" />

      <div className="flex-1 min-h-0 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border p-4 flex items-center gap-4"
          >
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        ))}
      </div>
    </main>
  );
}
