import { memo } from "react";

interface MiniStatProps {
  icon: React.ElementType;
  label: string;
  value: string;
  color: keyof typeof MINI_COLOR_MAP;
}

const MINI_COLOR_MAP = {
  indigo: { bg: "bg-indigo-100", text: "text-indigo-600" },
  pink: { bg: "bg-pink-100", text: "text-pink-600" },
  amber: { bg: "bg-amber-100", text: "text-amber-600" },
} as const;

export const MiniStat = memo(function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: MiniStatProps) {
  const c = MINI_COLOR_MAP[color];
  return (
    <div className="bg-white rounded-2xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
      <div className={`rounded-xl p-2.5 ${c.bg}`}>
        <Icon className={`h-4.5 w-4.5 ${c.text}`} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold leading-tight text-gray-900">{value}</p>
      </div>
    </div>
  );
});
