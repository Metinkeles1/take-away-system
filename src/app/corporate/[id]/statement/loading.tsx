import { Skeleton } from "@/components/ui/skeleton";

export default function StatementLoading() {
  return (
    <div style={{ padding: "12px", background: "#f5f5f5", minHeight: "100vh" }}>
      <div className="mx-auto max-w-2xl space-y-4 bg-white p-6 rounded">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <Skeleton className="h-6 w-32 ml-auto" />
      </div>
    </div>
  );
}
