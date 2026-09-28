"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Package, PackageX, Search, TrendingDown, Wallet } from "lucide-react";

import {
  type ProductPerformance as ProductPerformanceData,
  type ProductPerfRow,
  type ProductStatus,
} from "@/actions/komutaPerformance";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";
import { cn, formatCurrencyShort } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  ChangeChip,
  ChannelLegend,
  ChannelSplitBar,
  EmptyState,
  PerfStat,
  Sparkline,
  fmtInt,
} from "./shared";
import { StatStrip } from "../KomutaUI";
import { useKomutaFilters } from "../KomutaShell";
import { useKomutaQuery } from "../useKomutaQuery";

type Channel = OrderSource | "all";
type SortKey = "qty" | "prevQty" | "baseAvg" | "changePct" | "revenue";
type StatusFilter = "all" | ProductStatus;

const PAGE = 25;

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "down", label: "Düşüşte" },
  { id: "up", label: "Yükselişte" },
  { id: "new", label: "Yeni" },
  { id: "stopped", label: "Satmayan" },
];

function lastSoldText(ms: number | null): string {
  if (!ms) return "—";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "bugün satıldı";
  if (days === 1) return "son satış dün";
  return `son satış ${days} gün önce`;
}

function sparkTone(r: ProductPerfRow): "down" | "up" | "neutral" {
  return r.status === "down" || r.status === "stopped" ? "down" : r.status === "up" ? "up" : "neutral";
}

export function ProductPerformance({
  period,
  channel,
  dayOffset,
}: {
  period: DashboardPeriod;
  channel: Channel;
  dayOffset: number;
}) {
  const { refreshKey } = useKomutaFilters();
  const { data } = useKomutaQuery<ProductPerformanceData>("productPerf", [period, channel, dayOffset], {
    refreshKey,
  });
  const isLoading = data === null;

  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "qty", desc: true });
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<ProductPerfRow | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const byStatus = useMemo(() => {
    const m: Record<ProductStatus, ProductPerfRow[]> = { down: [], up: [], new: [], stopped: [], steady: [] };
    for (const r of rows) m[r.status].push(r);
    m.down.sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
    m.up.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    m.stopped.sort((a, b) => b.baseAvg - a.baseAvg);
    m.new.sort((a, b) => b.qty - a.qty);
    return m;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    const filtered = rows.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (!q ||
          r.name.toLocaleLowerCase("tr-TR").includes(q) ||
          r.variants.some((v) => v.toLocaleLowerCase("tr-TR").includes(q))),
    );
    const val = (r: ProductPerfRow) => (sort.key === "changePct" ? (r.changePct ?? -Infinity) : r[sort.key]);
    return filtered.sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)));
  }, [rows, status, query, sort]);

  const t = data?.totals;
  const qtyDelta = t && t.prevQty > 0 ? ((t.qty - t.prevQty) / t.prevQty) * 100 : null;
  const revDelta = t && t.prevRevenue > 0 ? ((t.revenue - t.prevRevenue) / t.prevRevenue) * 100 : null;
  const deltaOf = (d: number | null) =>
    d === null ? null : { text: `${d >= 0 ? "▲" : "▼"} %${Math.abs(d).toFixed(0)}`, good: d >= 0 };
  const showSplit = channel === "all";

  const pickStatus = (s: StatusFilter) => {
    setStatus(s);
    setLimit(PAGE);
  };

  const header = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return (
      <th className="px-2 py-2 text-right">
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap rounded text-xs font-semibold transition-colors hover:text-foreground",
            active ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground",
          )}
        >
          {label}
          {active && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
        </button>
      </th>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <StatStrip className="grid-cols-2 lg:grid-cols-4">
        <PerfStat
          label="Satılan adet"
          icon={Package}
          value={fmtInt(t?.qty ?? 0)}
          delta={deltaOf(qtyDelta)}
          sub={data ? `${data.prevLabel}: ${fmtInt(t?.prevQty ?? 0)}` : undefined}
          isLoading={isLoading}
        />
        <PerfStat
          label="Ürün cirosu"
          icon={Wallet}
          value={formatCurrencyShort(t?.revenue ?? 0)}
          delta={deltaOf(revDelta)}
          sub={data?.prevLabel}
          isLoading={isLoading}
        />
        <PerfStat
          label="Düşüşte"
          icon={TrendingDown}
          value={String(byStatus.down.length)}
          tone={byStatus.down.length > 0 ? "bad" : undefined}
          sub={data ? `normalinden %${data.changeThreshold}+ az` : undefined}
          isLoading={isLoading}
          onClick={() => pickStatus("down")}
        />
        <PerfStat
          label="Hiç satmayan"
          icon={PackageX}
          value={String(byStatus.stopped.length)}
          tone={byStatus.stopped.length > 0 ? "warn" : undefined}
          sub="normalde satıyordu"
          isLoading={isLoading}
          onClick={() => pickStatus("stopped")}
        />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ─── Ürün tablosu ─── */}
        <Card className="min-w-0 gap-3 lg:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Ürünler</CardTitle>
              <CardDescription>
                {data
                  ? `Değişim, ${data.baseLabel} ortalamasına göre. Satıra tıkla → detay.`
                  : "Yükleniyor…"}
              </CardDescription>
            </div>
            {showSplit && <ChannelLegend />}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1">
                {STATUS_TABS.map((s) => {
                  const count = s.id === "all" ? rows.length : byStatus[s.id as ProductStatus].length;
                  const active = status === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pickStatus(s.id)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {s.label}
                      {!isLoading && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="relative sm:w-52">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="perf-product-search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(PAGE);
                  }}
                  placeholder="Ürün ara"
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyState>
                {rows.length === 0 ? "Bu dönemde satış kaydı yok." : "Bu filtreye uyan ürün yok."}
              </EmptyState>
            ) : (
              <div className="-mx-6 overflow-x-auto px-6">
                <table className="w-full min-w-160 border-collapse text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Ürün</th>
                      {header("qty", "Adet")}
                      {header("prevQty", "Önceki")}
                      {header("baseAvg", "Normal")}
                      {header("changePct", "Değişim")}
                      {header("revenue", "Ciro")}
                      {showSplit && (
                        <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Kanal</th>
                      )}
                      <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">
                        Son 8 dönem
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, limit).map((r) => (
                      <tr
                        key={r.key}
                        onClick={() => setDetail(r)}
                        className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="max-w-56 px-2 py-2">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{r.name}</span>
                            <StatusTag status={r.status} />
                          </div>
                          {r.variants.length > 0 && (
                            <p className="truncate text-[11px] text-muted-foreground">
                              + {r.variants.join(", ")}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmtInt(r.qty)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {fmtInt(r.prevQty)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {r.baseAvg.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <ChangeChip pct={r.changePct} threshold={data?.changeThreshold ?? 25} />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatCurrencyShort(r.revenue)}</td>
                        {showSplit && (
                          <td className="px-2 py-2">
                            <ChannelSplitBar own={r.own.qty} trendyol={r.trendyol.qty} />
                          </td>
                        )}
                        <td className="px-2 py-2">
                          <Sparkline
                            values={r.history.map((h) => h.own + h.trendyol)}
                            tone={sparkTone(r)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoading && visible.length > limit && (
              <Button variant="outline" size="sm" className="self-center" onClick={() => setLimit((l) => l + 50)}>
                Daha fazla göster ({visible.length - limit})
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ─── Yan listeler ─── */}
        <div className="flex flex-col gap-4">
          <SideList
            title="Düşüşte"
            dot="bg-rose-500"
            desc={data ? `${data.baseLabel} ortalamasına göre` : ""}
            rows={byStatus.down}
            isLoading={isLoading}
            empty="Normalinden belirgin düşen ürün yok."
            onPick={setDetail}
            right={(r) => (
              <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                −%{Math.abs(r.changePct ?? 0).toFixed(0)}
              </span>
            )}
            sub={(r) => `normal ${r.baseAvg.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} → ${r.qty} adet`}
          />
          <SideList
            title="Yükselişte"
            dot="bg-emerald-500"
            rows={byStatus.up}
            isLoading={isLoading}
            empty="Belirgin yükselen ürün yok."
            onPick={setDetail}
            right={(r) => (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                +%{(r.changePct ?? 0).toFixed(0)}
              </span>
            )}
            sub={(r) => `normal ${r.baseAvg.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} → ${r.qty} adet`}
          />
          <SideList
            title="Bu dönem hiç satmadı"
            dot="bg-muted-foreground"
            rows={byStatus.stopped}
            isLoading={isLoading}
            empty="Normalde satan her ürün bu dönem de satmış."
            onPick={setDetail}
            right={() => (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">0</span>
            )}
            sub={(r) =>
              `${lastSoldText(r.lastSoldAt)} · normal ${r.baseAvg.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
            }
          />
        </div>
      </div>

      {data && (
        <p className="text-xs text-muted-foreground">
          &quot;Normal&quot; = {data.baseLabel} ortalaması. Az satan ürünler yanıltmasın diye düşüş/yükseliş için
          normalde dönem başına en az {data.minBase} adet satması gerekir. Menüde farklı yazılan aynı ürünler
          (ör. Trendyol&apos;daki ad) tek satırda birleşir. İptaller sayılmaz.
        </p>
      )}

      <ProductDetailDialog row={detail} onClose={() => setDetail(null)} baseLabel={data?.baseLabel ?? ""} />
    </div>
  );
}

function StatusTag({ status }: { status: ProductStatus }) {
  if (status === "steady" || status === "down" || status === "up") return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
        status === "new" && "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
        status === "stopped" && "bg-muted text-muted-foreground",
      )}
    >
      {status === "new" ? "yeni" : "satmadı"}
    </span>
  );
}

function SideList({
  title,
  desc,
  dot,
  rows,
  isLoading,
  empty,
  onPick,
  right,
  sub,
}: {
  title: string;
  desc?: string;
  dot: string;
  rows: ProductPerfRow[];
  isLoading: boolean;
  empty: string;
  onPick: (r: ProductPerfRow) => void;
  right: (r: ProductPerfRow) => React.ReactNode;
  sub: (r: ProductPerfRow) => string;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 5);
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className={cn("size-2 rounded-full", dot)} />
            {title}
            {!isLoading && <span className="font-normal tabular-nums text-muted-foreground">{rows.length}</span>}
          </CardTitle>
          {desc && <span className="text-[11px] text-muted-foreground">{desc}</span>}
        </div>
      </CardHeader>
      <CardContent className="px-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {shown.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => onPick(r)}
                  className="flex w-full items-center justify-between gap-3 rounded py-2 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{sub(r)}</span>
                  </span>
                  {right(r)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!isLoading && rows.length > 5 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-1 text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
          >
            {open ? "Daha az göster" : `Tümünü göster (${rows.length})`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

const historyConfig = {
  own: { label: "Kendi", color: "#3b82f6" },
  trendyol: { label: "Trendyol", color: "#f97316" },
} satisfies ChartConfig;

function ProductDetailDialog({
  row,
  onClose,
  baseLabel,
}: {
  row: ProductPerfRow | null;
  onClose: () => void;
  baseLabel: string;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {row.name}
                <StatusTag status={row.status} />
              </DialogTitle>
              <DialogDescription>
                Son 8 denk dönemde satılan adet · {lastSoldText(row.lastSoldAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Bu dönem" value={`${fmtInt(row.qty)} adet`} />
              <MiniStat
                label={`Normal (${baseLabel})`}
                value={`${row.baseAvg.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} adet`}
              />
              <MiniStat label="Ciro" value={formatCurrencyShort(row.revenue)} />
            </div>

            <ChartContainer config={historyConfig} className="aspect-auto h-56 w-full">
              <BarChart data={row.history} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.5} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} width={40} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <Bar dataKey="own" name="Kendi" stackId="a" fill="var(--color-own)" />
                <Bar dataKey="trendyol" name="Trendyol" stackId="a" fill="var(--color-trendyol)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <ChannelLegend />
              <span className="tabular-nums">
                Bu dönem: Kendi {fmtInt(row.own.qty)} · Trendyol {fmtInt(row.trendyol.qty)}
              </span>
            </div>

            {row.variants.length > 0 && (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Birleştirilen yazımlar: <span className="text-foreground">{row.variants.join(", ")}</span>
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
