import React from "react";

interface EmptyStateProps {
  icon: React.ElementType;
  text: string;
  subtext?: string;
  color?: string;
}

export function EmptyState({
  icon: Icon,
  text,
  subtext,
  color = "gray",
}: EmptyStateProps) {
  const bgClass = color === "emerald" ? "bg-emerald-50" : "bg-gray-100";
  const iconClass = color === "emerald" ? "text-emerald-400" : "text-gray-400";

  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className={`h-14 w-14 rounded-2xl ${bgClass} flex items-center justify-center mb-3`}>
        <Icon className={`h-7 w-7 ${iconClass}`} />
      </div>
      <p className="text-sm font-medium text-gray-600">{text}</p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}
