"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Store, Hand, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { type DashboardSource } from "@/actions/dashboard";

const SOURCES: {
  value: DashboardSource;
  label: string;
  icon: typeof Store;
  activeClass: string;
}[] = [
  {
    value: "all",
    label: "Tümü",
    icon: Layers,
    activeClass: "bg-slate-900 text-white border-slate-900",
  },
  {
    value: "manual",
    label: "Manuel",
    icon: Hand,
    activeClass: "bg-emerald-600 text-white border-emerald-600",
  },
  {
    value: "trendyol",
    label: "Trendyol",
    icon: Store,
    activeClass: "bg-emerald-600 text-white border-emerald-600",
  },
];

interface Props {
  source: DashboardSource;
}

export function SourceFilter({ source }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setSource = useCallback(
    (next: DashboardSource) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("source");
      else params.set("source", next);
      const query = params.toString();
      router.replace(`/dashboard${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm">
      {SOURCES.map(({ value, label, icon: Icon, activeClass }) => {
        const isActive = source === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setSource(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? activeClass
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
