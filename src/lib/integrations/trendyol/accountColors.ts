// Trendyol hesabı rozet renkleri (istemci + sunucu ortak). Panelde siparişin
// hangi işletmeye ait olduğunu ayırt etmek için.
export const TRENDYOL_ACCOUNT_COLORS = [
  "orange",
  "blue",
  "green",
  "purple",
  "pink",
  "teal",
] as const;

export type TrendyolAccountColor = (typeof TRENDYOL_ACCOUNT_COLORS)[number];

export const ACCOUNT_BADGE_CLASS: Record<TrendyolAccountColor, string> = {
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  green: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-500/20 dark:text-pink-300",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300",
};

export const ACCOUNT_DOT_CLASS: Record<TrendyolAccountColor, string> = {
  orange: "bg-orange-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
};

export function accountColor(c: string | undefined | null): TrendyolAccountColor {
  return TRENDYOL_ACCOUNT_COLORS.includes(c as TrendyolAccountColor)
    ? (c as TrendyolAccountColor)
    : "orange";
}
