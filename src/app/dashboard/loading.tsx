import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50/80">
      {/* Header */}
      <header className="shrink-0 bg-white border-b px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <div>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-48 mt-1" />
          </div>
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </header>

      <div className="shrink-0 px-6 pt-6 pb-0 space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border shadow-sm border-l-4 border-l-gray-200">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-10 w-10 rounded-xl" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Mini Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl bg-white border p-3.5 flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-10" />
                </div>
              </div>
            ))}
          </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="px-6 pt-4 pb-6 space-y-4">

          {/* Row 1: Trend + Donut */}
          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3 border shadow-sm">
              <CardHeader className="pb-3"><Skeleton className="h-4 w-36" /></CardHeader>
              <CardContent>
                <div className="space-y-3">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
              </CardContent>
            </Card>
            <Card className="xl:col-span-2 border shadow-sm">
              <CardHeader className="pb-3"><Skeleton className="h-4 w-32" /></CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-5 py-4">
                  <Skeleton className="h-36 w-36 rounded-full" />
                  <div className="space-y-2 w-full">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Active + Recent */}
          <div className="grid gap-4 xl:grid-cols-2">
            {[...Array(2)].map((_, j) => (
              <Card key={j} className="border shadow-sm">
                <CardHeader className="pb-3"><Skeleton className="h-4 w-32" /></CardHeader>
                <CardContent>
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Row 3: Payments */}
          <div className="grid gap-4 xl:grid-cols-2">
            {[...Array(2)].map((_, j) => (
              <Card key={j} className="border shadow-sm">
                <CardHeader className="pb-3"><Skeleton className="h-4 w-40" /></CardHeader>
                <CardContent>
                  <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
