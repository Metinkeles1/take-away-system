"use client";

import Link from "next/link";
import { cn, formatCurrencyShort } from "@/lib/utils";
import type { PanelSummary } from "@/actions/panel";
import type { CourierCashState } from "@/actions/courierCash";

// Üst sayı şeridi. Panel herkesin gördüğü ekranda açık durduğu için ciro yok;
// yalnız operasyon sayıları (adet, süre) ve işletmenin takip etmesi gereken
// para (kuryedeki, açık hesaptaki).

function Tile({
  label,
  value,
  unit,
  sub,
  tone,
  href,
  className,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  tone?: "good" | "warn" | "bad";
  href?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate text-xl font-bold leading-tight tracking-tight tabular-nums xl:text-2xl",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value}
        {unit && <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>}
      </p>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      {children}
    </>
  );
  const cls = cn(
    "min-w-0 rounded-xl border bg-card px-3 py-2 xl:px-4 xl:py-2.5",
    href && "transition-colors hover:bg-muted/40",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function PanelStats({ s, cash, now }: { s: PanelSummary | null; cash: CourierCashState | null; now: number }) {
  const dash = "—";
  const total = s ? s.own + s.trendyol : 0;
  const diff = s ? total - s.yesterdaySoFar : 0;
  const avg = s?.avgDeliveryMin ?? null;
  const onTimePct = s && s.deliveredToday > 0 ? Math.round((s.onTimeCount / s.deliveredToday) * 100) : null;
  const onCourier = cash ? cash.totalCash + cash.totalCard : null;
  // Uyarı: tutar eşiği VEYA en eski teslim edilmemiş para süre eşiğini geçti.
  const cashAlert =
    !!cash &&
    cash.rows.some(
      (r) => r.cash >= cash.alert.amount || (now - new Date(r.oldestAt).getTime()) / 60000 >= cash.alert.minutes,
    );

  return (
    <div className="grid shrink-0 grid-cols-3 gap-2 md:grid-cols-5 xl:gap-3">
      <Tile
        label="Bugün sipariş"
        value={s ? String(total) : dash}
        sub={
          s &&
          (s.yesterdaySoFar > 0 ? (
            <span className={cn(diff > 0 && "text-emerald-600 dark:text-emerald-400", diff < 0 && "text-amber-600 dark:text-amber-400")}>
              {diff === 0 ? "dünle aynı" : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)}`} · dün
              <span className="hidden xl:inline"> bu saatte</span> {s.yesterdaySoFar}
            </span>
          ) : (
            `${s.cancelled} iptal`
          ))
        }
      >
        {/* Telefon / Trendyol payı */}
        {s && total > 0 && (
          <div className="mt-1.5 hidden items-center gap-2 md:flex">
            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-orange-500/80">
              <div className="h-full bg-sky-500" style={{ width: `${(s.own / total) * 100}%` }} />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              <span className="text-sky-600 dark:text-sky-400">{s.own}</span> /{" "}
              <span className="text-orange-600 dark:text-orange-400">{s.trendyol}</span>
            </span>
          </div>
        )}
      </Tile>
      <Tile
        label="Ort. teslim"
        value={avg !== null ? String(avg) : dash}
        unit={avg !== null ? "dk" : undefined}
        tone={avg === null || !s ? undefined : avg <= s.deliveryTargetMin ? "good" : "bad"}
        sub={
          s && (
            <>
              <span className="md:hidden">{onTimePct !== null ? `%${onTimePct} zamanında` : `hedef ${s.deliveryTargetMin} dk`}</span>
              <span className="hidden md:inline">
                hedef {s.deliveryTargetMin} dk<span className="hidden xl:inline"> · {s.deliveredToday} teslim</span>
              </span>
            </>
          )
        }
      />
      <Tile
        label="Zamanında"
        className="hidden md:block"
        value={onTimePct !== null ? `%${onTimePct}` : dash}
        tone={onTimePct === null ? undefined : onTimePct >= 85 ? "good" : onTimePct >= 70 ? "warn" : "bad"}
        sub={s && s.deliveredToday > 0 ? `${s.onTimeCount} / ${s.deliveredToday} teslim hedefte` : "henüz teslim yok"}
      />
      <Tile
        label="Kuryelerde"
        value={onCourier !== null ? formatCurrencyShort(onCourier) : dash}
        tone={cashAlert ? "bad" : undefined}
        sub={cash ? `Nakit ${formatCurrencyShort(cash.totalCash)} · Kart ${formatCurrencyShort(cash.totalCard)}` : undefined}
        href="/gun-sonu"
      />
      <Tile
        label="Açık hesap"
        className="hidden md:block"
        value={s ? formatCurrencyShort(s.openAccounts.total) : dash}
        sub={s ? `${s.openAccounts.customerCount} müşteri · ${s.openAccounts.count} sipariş` : undefined}
        href="/open-accounts"
      />
    </div>
  );
}

// Saat saat gelen sipariş adedi — telefon (mavi) + Trendyol (turuncu) üst üste.
// İçinde bulunulan saat soluk çizilir (henüz bitmedi).
// Pencere ilk siparişin saatinden şu anki saate kadar; en az 8 saat gösterilir
// ki gün başında tek dev çubuk çıkmasın.
export function HourlyBars({ s, nowHour }: { s: PanelSummary | null; nowHour: number }) {
  const data = s?.hourly ?? [];
  const active = data.filter((d) => d.own + d.trendyol > 0).map((d) => d.hour);
  const from = active[0] ?? (nowHour < 6 ? 0 : Math.min(10, nowHour));
  const to = Math.min(23, Math.max(nowHour, active[active.length - 1] ?? 0, from + 7));
  const shown = data.filter((d) => d.hour >= from && d.hour <= to);
  const max = Math.max(1, ...shown.map((d) => d.own + d.trendyol));
  const peak = shown.reduce<(typeof shown)[number] | null>((p, d) => (!p || d.own + d.trendyol > p.own + p.trendyol ? d : p), null);
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between px-4 pt-3">
        <h2 className="text-sm font-semibold">Saatlik sipariş</h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm bg-sky-500" />
            Telefon
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm bg-orange-500" />
            Trendyol
          </span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-end gap-1 px-4 pb-1 pt-3">
        {shown.map((d) => {
          const n = d.own + d.trendyol;
          return (
            <div key={d.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5" title={`${hh(d.hour)} · ${d.own} telefon, ${d.trendyol} Trendyol`}>
              {n > 0 && <span className={cn("text-xs font-medium leading-none tabular-nums text-muted-foreground", d.hour === nowHour && "text-foreground")}>{n}</span>}
              <div
                className={cn("flex w-full flex-col overflow-hidden rounded-t-sm", n > 0 && d.hour === nowHour && "opacity-70")}
                style={{ height: `${(n / max) * 80}%` }}
              >
                <div className="bg-orange-500/85" style={{ flexGrow: d.trendyol }} />
                <div className="bg-sky-500/85" style={{ flexGrow: d.own }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 justify-between px-4 pb-2.5 text-xs tabular-nums text-muted-foreground">
        <span>{hh(from)}</span>
        {peak && peak.own + peak.trendyol > 0 && (
          <span>
            En yoğun {hh(peak.hour)} · {peak.own + peak.trendyol} sipariş
          </span>
        )}
        <span>{hh(to)}</span>
      </div>
    </div>
  );
}
