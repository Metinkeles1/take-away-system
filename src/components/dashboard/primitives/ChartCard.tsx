import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  legend?: React.ReactNode;
  height?: number;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  action,
  legend,
  height = 260,
  className,
  bodyClassName,
  children,
}: ChartCardProps) {
  return (
    <div className={cn("rounded-lg border border-border/60", className)}>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {legend}
          {action}
        </div>
      </div>
      <div
        className={cn("px-2 py-3", bodyClassName)}
        style={{ height }}
      >
        {children}
      </div>
    </div>
  );
}

export function ChartLegendItem({
  label,
  color = "bg-foreground",
  muted,
}: {
  label: string;
  color?: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        muted && "text-muted-foreground",
      )}
    >
      <span className={cn("size-2 rounded-sm", color)} />
      {label}
    </span>
  );
}
