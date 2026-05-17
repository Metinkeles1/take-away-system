// Dashboard primitives için ortak formatlama yardımcıları.

export type MetricFormat = "currency" | "int" | "pct" | "compact";

export function fmtValue(value: number, kind: MetricFormat = "int"): string {
  if (kind === "currency") {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: value >= 10_000 ? 0 : 2,
    }).format(value);
  }
  if (kind === "pct") return `${value.toFixed(1)}%`;
  if (kind === "compact") {
    return new Intl.NumberFormat("tr-TR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("tr-TR").format(value);
}

export function fmtRelativeTime(ts: number | Date): string {
  const ms = (typeof ts === "number" ? ts : ts.getTime()) - Date.now();
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  return `${Math.round(hr / 24)} g önce`;
}
