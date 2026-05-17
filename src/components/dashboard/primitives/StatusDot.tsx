import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "warn" | "active" | "success" | "danger";

const TONE: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-sky-500",
  warn: "bg-amber-500",
  active: "bg-violet-500",
  success: "bg-emerald-500",
  danger: "bg-rose-500",
};

export function StatusDot({
  tone = "neutral",
  label,
  className,
}: {
  tone?: StatusTone;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-foreground/80",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", TONE[tone])} />
      {label}
    </span>
  );
}
