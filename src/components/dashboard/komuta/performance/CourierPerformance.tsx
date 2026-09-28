"use client";

import { useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { AlarmClock, Bike, Pencil, Timer, TimerReset } from "lucide-react";
import { toast } from "sonner";

import {
  type CourierPerformance as CourierPerformanceData,
  type CourierPerfRow,
  type SlowOrder,
} from "@/actions/komutaPerformance";
import { setDeliveryTargetMin } from "@/actions/settings";
import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { type OrderSource } from "@/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { EmptyState, PerfStat, fmtInt, fmtMin } from "./shared";
import { StatStrip } from "../KomutaUI";
import { useKomutaFilters } from "../KomutaShell";
import { useKomutaQuery } from "../useKomutaQuery";

type Channel = OrderSource | "all";

// Hedefe göre renk: rahat (hedef−5 altı) yeşil, sınırda mor, aşıyor kırmızı.
function paceClass(avg: number, target: number, kind: "bg" | "text"): string {
  if (avg > target) return kind === "bg" ? "bg-rose-500" : "text-rose-600 dark:text-rose-400";
  if (avg <= target - 5) return kind === "bg" ? "bg-emerald-500" : "text-emerald-600 dark:text-emerald-400";
  return kind === "bg" ? "bg-violet-500" : "text-violet-700 dark:text-violet-300";
}

function minDelta(cur: number | null, prev: number | null) {
  if (cur === null || prev === null) return null;
  const d = Math.round(cur - prev);
  if (d === 0) return { text: "± 0 dk", good: null };
  // Süre düştüyse iyi.
  return { text: `${d < 0 ? "▼" : "▲"} ${Math.abs(d)} dk`, good: d < 0 };
}

export function CourierPerformance({
  period,
  channel,
  dayOffset,
}: {
  period: DashboardPeriod;
  channel: Channel;
  dayOffset: number;
}) {
  // Hedef değişince (version) aynı veri yeniden çekilir.
  const [version, setVersion] = useState(0);
  const { refreshKey } = useKomutaFilters();
  const { data } = useKomutaQuery<CourierPerformanceData>("courierPerf", [period, channel, dayOffset], {
    refreshKey: `${refreshKey}.${version}`,
  });
  const isLoading = data === null;
  const [detail, setDetail] = useState<CourierPerfRow | null>(null);

  const t = data?.totals;
  const target = data?.target ?? 35;
  const overPct = t && t.count > 0 ? (t.overTarget / t.count) * 100 : 0;
  const overDelta =
    t && t.count > 0 && t.prevOverTargetPct !== null
      ? (() => {
          const d = Math.round(overPct - t.prevOverTargetPct);
          return d === 0 ? null : { text: `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} puan`, good: d < 0 };
        })()
      : null;

  if (data && t && t.count === 0) {
    return (
      <EmptyState>
        Bu dönemde teslim süresi kaydı olan paket yok.
        {channel === "trendyol" && " Trendyol'da yalnız bizim kuryenin taşıdığı paketler sayılır."}
      </EmptyState>
    );
  }

  const maxScale = Math.max(target + 15, ...(data?.rows.map((r) => r.avg) ?? [0])) * 1.1;

  return (
    <div className="flex flex-col gap-4">
      <StatStrip className="grid-cols-2 lg:grid-cols-4">
        <PerfStat
          label="Ortalama teslim"
          icon={Timer}
          value={t?.avg != null ? fmtMin(t.avg) : "—"}
          delta={minDelta(t?.avg ?? null, t?.prevAvg ?? null)}
          sub={data?.prevLabel}
          tone={t?.avg != null ? (t.avg > target ? "bad" : undefined) : undefined}
          isLoading={isLoading}
        />
        <PerfStat
          label="Medyan"
          icon={TimerReset}
          value={t?.median != null ? fmtMin(t.median) : "—"}
          sub="paketlerin yarısı bundan hızlı"
          isLoading={isLoading}
        />
        <PerfStat
          label={`${target} dk'yı aşan`}
          icon={AlarmClock}
          value={`%${overPct.toFixed(0)}`}
          delta={overDelta}
          sub={t ? `${fmtInt(t.overTarget)} paket` : undefined}
          tone={overPct >= 20 ? "bad" : overPct >= 10 ? "warn" : undefined}
          isLoading={isLoading}
          action={<TargetEditor target={target} onSaved={() => setVersion((v) => v + 1)} />}
        />
        <PerfStat
          label="Teslim edilen paket"
          icon={Bike}
          value={fmtInt(t?.count ?? 0)}
          sub={channel === "manual" ? "kendi siparişler" : "Trendyol GO hariç"}
          isLoading={isLoading}
        />
      </StatStrip>

      {/* ─── Kurye karşılaştırması ─── */}
      <Card className="gap-3">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>Kurye karşılaştırması</CardTitle>
            <CardDescription>Çizgi = {target} dk hedef. Satıra tıkla → gün gün süre ve en yavaş paketler.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <div className="-mx-6 overflow-x-auto px-6">
              <table className="w-full min-w-170 border-collapse text-sm">
                <thead>
                  <tr className="border-b text-xs font-semibold text-muted-foreground">
                    <th className="px-2 py-2 text-left">Kurye</th>
                    <th className="px-2 py-2 text-right">Paket</th>
                    <th className="px-2 py-2 text-right">Ortalama</th>
                    <th className="px-2 py-2 text-left">Hedefe göre</th>
                    <th className="px-2 py-2 text-right">En hızlı / yavaş</th>
                    <th className="px-2 py-2 text-right">Hedef aşımı</th>
                    <th className="px-2 py-2 text-right">Önceki</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((r) => {
                    const over = (r.overTarget / r.count) * 100;
                    const d = minDelta(r.avg, r.prevAvg);
                    return (
                      <tr
                        key={r.key}
                        onClick={() => setDetail(r)}
                        className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                              {r.name.charAt(0)}
                            </span>
                            <span className="font-medium">{r.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          <span className="font-semibold">{r.count}</span>
                          {channel === "all" && r.trendyol > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              {r.own} kendi · {r.trendyol} TY
                            </span>
                          )}
                        </td>
                        <td className={cn("px-2 py-2.5 text-right font-semibold tabular-nums", paceClass(r.avg, target, "text"))}>
                          {fmtMin(r.avg)}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="relative h-2 w-28 rounded-full bg-muted">
                            <span
                              className={cn("absolute inset-y-0 left-0 rounded-full", paceClass(r.avg, target, "bg"))}
                              style={{ width: `${Math.min(100, (r.avg / maxScale) * 100)}%` }}
                            />
                            <span
                              className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/70"
                              style={{ left: `${(target / maxScale) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                          {Math.round(r.fastest)} / {Math.round(r.slowest)} dk
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                              over >= 20
                                ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                                : over >= 10
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            %{over.toFixed(0)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right text-xs tabular-nums">
                          {d ? (
                            <span
                              className={cn(
                                "font-medium",
                                d.good === true && "text-emerald-600 dark:text-emerald-400",
                                d.good === false && "text-rose-600 dark:text-rose-400",
                                d.good === null && "text-muted-foreground",
                              )}
                            >
                              {d.text}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">yeni</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {data?.unassigned && (
                    <tr className="text-muted-foreground">
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-xs">
                            ?
                          </span>
                          <span>Kurye adı yok</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{data.unassigned.count}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{fmtMin(data.unassigned.avg)}</td>
                      <td colSpan={4} className="px-2 py-2.5 text-xs">
                        Kurye seçilmeden teslim edilmiş ya da süresi Trendyol kaydından alınmış paketler
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <HourlyChart
          className="lg:col-span-3"
          hourly={data?.hourly ?? []}
          target={target}
          isLoading={isLoading}
        />
        <Distribution
          className="lg:col-span-2"
          buckets={data?.buckets ?? []}
          total={t?.count ?? 0}
          target={target}
          isLoading={isLoading}
        />
      </div>

      <SlowOrdersCard orders={data?.slowOrders ?? []} target={target} isLoading={isLoading} showCourier />

      <p className="text-xs text-muted-foreground">
        Süre = sipariş alındığı an → kurye &quot;teslim ettim&quot; dediği an. Trendyol&apos;da yalnız bizim
        kuryenin taşıdığı paketler sayılır (Trendyol GO hariç). Teslim süresi kaydı olmayan eski siparişler
        hesaba girmez.
        {data && data.excluded > 0 &&
          ` 180 dakikayı aşan ${data.excluded} kayıt hatalı sayılıp hesaptan çıkarıldı.`}
      </p>

      <CourierDetailDialog
        row={detail}
        target={target}
        seriesUnit={data?.seriesUnit ?? "day"}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}

// ─── Hedef süresi düzenleme ──────────────────────────────────────────────────
function TargetEditor({ target, onSaved }: { target: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(target));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await setDeliveryTargetMin(Number(value));
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Kaydedilemedi");
      return;
    }
    toast.success(`Teslim hedefi ${Math.round(Number(value))} dk olarak kaydedildi`);
    setOpen(false);
    onSaved();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(String(target));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Teslim hedefini değiştir"
        >
          <Pencil className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex flex-col gap-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="delivery-target">Teslim hedefi (dakika)</Label>
            <Input
              id="delivery-target"
              type="number"
              inputMode="numeric"
              min={10}
              max={120}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Sipariş alındıktan sonra bu süreyi aşan teslimler &quot;geç&quot; sayılır.
            </p>
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// ─── Saate göre ortalama süre ────────────────────────────────────────────────
const hourConfig = { avg: { label: "Ortalama", color: "#8b5cf6" } } satisfies ChartConfig;

function HourlyChart({
  hourly,
  target,
  isLoading,
  className,
}: {
  hourly: { hour: number; avg: number; count: number }[];
  target: number;
  isLoading: boolean;
  className?: string;
}) {
  const data = hourly.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, "0")}:00` }));
  const worst = hourly.reduce<{ hour: number; avg: number } | null>(
    (w, h) => (h.count >= 3 && (!w || h.avg > w.avg) ? h : w),
    null,
  );
  const yMax = Math.max(target + 10, ...hourly.map((h) => h.avg));
  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader>
        <CardTitle>Saate göre ortalama süre (dk)</CardTitle>
        <CardDescription>
          {worst && worst.avg > target
            ? `En yavaş saat ${String(worst.hour).padStart(2, "0")}:00 (${worst.avg} dk). Kırmızı = hedef üstü.`
            : "Siparişin alındığı saate göre. Kırmızı = hedef üstü."}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <ChartContainer config={hourConfig} className="aspect-auto h-56 w-full">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 16, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.5} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} domain={[0, Math.ceil(yMax / 5) * 5]} />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    formatter={(v, _n, item) => (
                      <span className="tabular-nums">
                        {v} dk · {(item.payload as { count: number }).count} paket
                      </span>
                    )}
                  />
                }
              />
              <ReferenceLine
                y={target}
                stroke="var(--foreground)"
                strokeOpacity={0.6}
                strokeDasharray="4 3"
                label={{ value: `hedef ${target} dk`, position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.hour} fill={d.avg > target ? "#f43f5e" : "var(--color-avg)"} fillOpacity={d.avg > target ? 0.9 : 0.55} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Süre dağılımı ───────────────────────────────────────────────────────────
function Distribution({
  buckets,
  total,
  target,
  isLoading,
  className,
}: {
  buckets: { label: string; from: number; to: number | null; count: number }[];
  total: number;
  target: number;
  isLoading: boolean;
  className?: string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader>
        <CardTitle>Süre dağılımı</CardTitle>
        <CardDescription>{fmtInt(total)} paket · kırmızı = hedefi aşan aralık</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <ul className="flex flex-col gap-3">
            {buckets.map((b) => {
              const late = b.from >= target;
              const partial = !late && b.to !== null && b.to > target;
              return (
                <li key={b.label} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{b.label}</span>
                  <div className="h-3.5 overflow-hidden rounded bg-muted">
                    <div
                      className={cn(
                        "h-full rounded",
                        late ? "bg-rose-500" : partial ? "bg-amber-500" : "bg-violet-500",
                      )}
                      style={{ width: `${(b.count / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums">
                    {b.count}
                    <span className="ml-1 text-xs text-muted-foreground">
                      %{total ? Math.round((b.count / total) * 100) : 0}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── En yavaş paketler ───────────────────────────────────────────────────────
function SlowOrdersCard({
  orders,
  target,
  isLoading,
  showCourier,
  bare,
}: {
  orders: SlowOrder[];
  target: number;
  isLoading: boolean;
  showCourier?: boolean;
  bare?: boolean;
}) {
  const list = isLoading ? (
    <div className="space-y-2">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  ) : orders.length === 0 ? (
    <p className="text-sm text-muted-foreground">Kayıt yok.</p>
  ) : (
    <ul className="divide-y">
      {orders.map((o) => {
        const inner = (
          <>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-sm",
                    o.channel === "own" ? "bg-blue-500" : "bg-orange-500",
                  )}
                />
                #{o.orderNumber}
                {showCourier && o.courier && (
                  <span className="font-normal text-muted-foreground">· {o.courier}</span>
                )}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {o.when}
                {o.district ? ` · ${o.district}` : ""}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                o.minutes > target ? "text-rose-600 dark:text-rose-400" : "text-foreground",
              )}
            >
              {Math.round(o.minutes)} dk
            </span>
          </>
        );
        const cls = "flex items-center justify-between gap-3 py-2";
        return (
          <li key={`${o.channel}-${o.orderNumber}`}>
            {o.id ? (
              <Link href={`/orders/${o.id}`} className={cn(cls, "rounded transition-colors hover:bg-muted/40")}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );

  if (bare) return list;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>En uzun süren teslimler</CardTitle>
        <CardDescription>Bu dönemin en yavaş paketleri. Kendi siparişe tıkla → sipariş detayı.</CardDescription>
      </CardHeader>
      <CardContent>{list}</CardContent>
    </Card>
  );
}

// ─── Kurye detayı ────────────────────────────────────────────────────────────
const seriesConfig = { avg: { label: "Ortalama", color: "#8b5cf6" } } satisfies ChartConfig;

function CourierDetailDialog({
  row,
  target,
  seriesUnit,
  onClose,
}: {
  row: CourierPerfRow | null;
  target: number;
  seriesUnit: "hour" | "day";
  onClose: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{row.name}</DialogTitle>
              <DialogDescription>
                {row.count} paket · ortalama {fmtMin(row.avg)} · medyan {fmtMin(row.median)}
              </DialogDescription>
            </DialogHeader>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {seriesUnit === "hour" ? "Saat saat ortalama süre (dk)" : "Gün gün ortalama süre (dk)"}
              </p>
              <ChartContainer config={seriesConfig} className="aspect-auto h-48 w-full">
                <BarChart data={row.series} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.5} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} minTickGap={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} />
                  <ChartTooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={
                      <ChartTooltipContent
                        hideIndicator
                        formatter={(v, _n, item) => (
                          <span className="tabular-nums">
                            {v} dk · {(item.payload as { count: number }).count} paket
                          </span>
                        )}
                      />
                    }
                  />
                  <ReferenceLine y={target} stroke="var(--foreground)" strokeOpacity={0.6} strokeDasharray="4 3" />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {row.series.map((d) => (
                      <Cell
                        key={d.label}
                        fill={d.avg !== null && d.avg > target ? "#f43f5e" : "var(--color-avg)"}
                        fillOpacity={d.avg !== null && d.avg > target ? 0.9 : 0.55}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">En uzun süren teslimleri</p>
              <SlowOrdersCard orders={row.slowOrders} target={target} isLoading={false} bare />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
