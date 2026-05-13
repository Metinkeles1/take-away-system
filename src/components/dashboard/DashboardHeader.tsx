import { Button } from "@/components/ui/button";
import { RefreshCw, CalendarDays } from "lucide-react";
import { SourceFilter } from "./SourceFilter";
import { type DashboardSource } from "@/actions/dashboard";

interface DashboardHeaderProps {
  isLoading: boolean;
  onRefresh: () => void;
  title?: string;
  source?: DashboardSource;
}

export function DashboardHeader({
  isLoading,
  onRefresh,
  title = "Dashboard",
  source = "all",
}: DashboardHeaderProps) {
  return (
    <header className="shrink-0 bg-white border-b px-8 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p
          className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5"
          suppressHydrationWarning
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {new Date().toLocaleDateString("tr-TR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <SourceFilter source={source} />
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>
    </header>
  );
}
