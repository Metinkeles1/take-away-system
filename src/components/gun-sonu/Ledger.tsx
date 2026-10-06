"use client";

import { useMemo, useState } from "react";
import { Ban, Bike, Building2, ChevronDown, Clock, Hand, Landmark, Receipt } from "lucide-react";

import type { EndOfDayComparison, EndOfDayOrder, EndOfDayReport } from "@/actions/endOfDay";
import { Skeleton } from "@/components/ui/skeleton";
import { MEAL_CARD_PROVIDER_CUT } from "@/lib/commission";
import { cn, formatCurrency } from "@/lib/utils";

import {
  EPSILON,
  METHOD_META,
  METHOD_ORDER,
  isLate,
  ownNet,
  scopeFromKey,
  trendyolNet,
  type LedgerScope,
  type OrderFilter,
} from "./meta";

interface SubLine {
  label: string;
  count: number;
  amount: number;
  scope?: LedgerScope; // varsa tıklanınca listeyi süzer
}

interface Row {
  key: string;
  label: string;
  count: number | null;
  amount: number;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  scope?: LedgerScope;
  subs: SubLine[];
  subNote?: string;
}

interface Props {
  report: EndOfDayReport | null;
  orders: EndOfDayOrder[];
  comparison: EndOfDayComparison | null;
  targetMin: number;
  courierPending: number | null; // kuryelerde teslim edilmemiş para (yalnız bugün)
  isLoading: boolean;
  filter: OrderFilter;
  onFilter: (f: OrderFilter) => void;
}

// Para Defteri — günün parası nereden geldi, eline net ne geçti. Rakamlar
// rapordan (Trendyol API + yerel DB) gelir; gün kapatılınca dondurulan budur.
// Satıra tıkla → alt kırılım açılır ve sağdaki sipariş listesi o satıra süzülür.
export function Ledger({ report, orders, comparison, targetMin, courierPending, isLoading, filter, onFilter }: Props) {
  const rows = useMemo(() => (report ? buildRows(report, orders) : []), [report, orders]);
  const net = rows.reduce((s, r) => s + r.amount, 0);
  const corp = report ? buildCorporateRow(report) : null;
  // Şerit yalnız defterden bir satır seçiliyken diğerlerini soldurur (kanal/kurye seçimi değil).
  const fadeOthers = rows.some((r) => r.key === filter.scope?.key);
  const selected = filter.scope?.key;
  // Listesi olmayan satırlar (kurumsal) yalnız açılır/kapanır, listeyi süzmez.
  const [expanded, setExpanded] = useState<string | null>(null);

  const select = (scope: LedgerScope | undefined) =>
    onFilter({ ...filter, scope: scope && selected !== scope.key ? scope : undefined, state: undefined });

  if (isLoading || !report) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-3 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const delivered = orders.filter((o) => o.status === "delivered" && o.durationMin != null);
  const avgDur = delivered.length ? delivered.reduce((s, o) => s + (o.durationMin ?? 0), 0) / delivered.length : null;
  const late = orders.filter((o) => isLate(o, targetMin)).length;
  const change =
    comparison && comparison.totalRevenue > 0
      ? Math.round(((report.totalRevenue - comparison.totalRevenue) / comparison.totalRevenue) * 100)
      : null;

  const renderRow = (r: Row) => {
    const open =
      expanded === r.key ||
      (selected != null && (selected === r.key || r.subs.some((s) => s.scope?.key === selected)));
    const Icon = r.icon;
    return (
      <div key={r.key} className={cn("rounded-lg", open && "bg-muted/50")}>
        <button
          type="button"
          onClick={() => (r.scope ? select(r.scope) : setExpanded((e) => (e === r.key ? null : r.key)))}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
        >
          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
          {r.count != null && (
            <span className="text-[11px] tabular-nums text-muted-foreground">{r.count}</span>
          )}
          <span className="w-24 text-right font-semibold tabular-nums">{formatCurrency(r.amount)}</span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
              open && "rotate-180",
              r.subs.length === 0 && !r.subNote && "invisible",
            )}
          />
        </button>
        {open && (r.subs.length > 0 || r.subNote) && (
          <div className="flex flex-col pb-1.5 pl-10 pr-8">
            {r.subs.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={!s.scope}
                onClick={() => s.scope && select(s.scope)}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1 text-left text-xs",
                  s.scope && "hover:bg-background/70",
                  selected != null && s.scope?.key === selected && "bg-background font-medium ring-1 ring-border",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="tabular-nums text-muted-foreground">{s.count}</span>
                <span className="w-20 text-right tabular-nums">{formatCurrency(s.amount)}</span>
              </button>
            ))}
            {r.subNote && <p className="px-2 pt-1 text-[11px] text-muted-foreground">{r.subNote}</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      {/* Net toplam + günün kısa özeti */}
      <div className="flex flex-col gap-1 px-5 pt-5">
        <span className="text-xs font-medium text-muted-foreground">Eline geçen net</span>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-bold tracking-tight tabular-nums">{formatCurrency(net)}</span>
          {change != null && (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                change > 0 ? "text-emerald-600 dark:text-emerald-400" : change < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
              )}
              title={`Geçen hafta aynı gün brüt: ${formatCurrency(comparison!.totalRevenue)}`}
            >
              {change > 0 ? "▲" : change < 0 ? "▼" : ""} %{Math.abs(change)} geçen haftaya göre
            </span>
          )}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {report.packageCount} paket · brüt {formatCurrency(report.totalRevenue)} · ort. sepet{" "}
          {formatCurrency(report.avgBasket)}
          {avgDur != null && ` · ort. teslim ${Math.round(avgDur)} dk`}
        </span>
      </div>

      {/* Dağılım şeridi — satırların renk noktaları açıklamasıdır */}
      {net > EPSILON && (
        <div className="mx-5 mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {rows.map((r) => (
            <span
              key={r.key}
              title={`${r.label}: ${formatCurrency(r.amount)} (%${Math.round((r.amount / net) * 100)})`}
              className={cn("h-full transition-opacity", fadeOthers && selected !== r.key && "opacity-30")}
              style={{ width: `${(r.amount / net) * 100}%`, background: r.color }}
            />
          ))}
        </div>
      )}

      {/* Defter satırları */}
      <div className="mt-3 flex flex-col px-2">
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Bu gün tahsilat yok</p>
        )}
        {rows.map(renderRow)}
      </div>

      {/* Kurumsal — açık hesap, nete dahil değil */}
      {corp && (
        <div className="mx-2 mt-2 flex flex-col border-t pt-2">
          <span className="px-3 pb-1 text-[11px] font-medium text-muted-foreground">
            Açık hesaba yazılan · nete dahil değil
          </span>
          {renderRow(corp)}
        </div>
      )}

      {/* Kapanmadan önce bakılacaklar */}
      <div className="mx-5 mt-3 mb-5 flex flex-col gap-1 border-t pt-3">
        <Notice
          icon={Receipt}
          tone="warn"
          label="Açık hesap · tahsil edilmedi"
          value={report.openAmount > EPSILON ? `${report.openCount} · ${formatCurrency(report.openAmount)}` : null}
          active={filter.state === "open"}
          onClick={() => onFilter({ ...filter, scope: undefined, state: filter.state === "open" ? undefined : "open" })}
        />
        <Notice
          icon={Bike}
          tone="warn"
          label="Kuryelerde teslim edilmemiş"
          value={courierPending && courierPending > EPSILON ? formatCurrency(courierPending) : null}
        />
        <Notice
          icon={Clock}
          tone="bad"
          label={`Geç teslim · ${targetMin} dk üstü`}
          value={late > 0 ? String(late) : null}
          active={filter.state === "late"}
          onClick={() => onFilter({ ...filter, scope: undefined, state: filter.state === "late" ? undefined : "late" })}
        />
        <Notice
          icon={Ban}
          tone="bad"
          label="İptal · toplama dahil değil"
          value={report.cancelledCount > 0 ? String(report.cancelledCount) : null}
          active={filter.state === "cancelled"}
          onClick={() =>
            onFilter({ ...filter, scope: undefined, state: filter.state === "cancelled" ? undefined : "cancelled" })
          }
        />
      </div>
    </div>
  );
}

function Notice({
  icon: Icon,
  tone,
  label,
  value,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "warn" | "bad";
  label: string;
  value: string | null;
  active?: boolean;
  onClick?: () => void;
}) {
  if (value == null) return null;
  const color = tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm",
        onClick && "hover:bg-muted/60",
        active && "bg-muted ring-1 ring-border",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", color)} />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", color)}>{value}</span>
    </button>
  );
}

// Defter satırları: Trendyol (bankaya / kapıda) → kendi yöntemler → kurumsal.
function buildRows(report: EndOfDayReport, orders: EndOfDayOrder[]): Row[] {
  const rows: Row[] = [];
  const ty = trendyolNet(report.trendyol);
  const lines = report.trendyol?.lines ?? [];
  const tySub = (group: "online" | "onsite") =>
    lines.filter((l) => l.group === group).map((l) => ({ label: l.label, count: l.count, amount: l.gross }));
  const tyCount = (group: "online" | "onsite") =>
    lines.filter((l) => l.group === group).reduce((s, l) => s + l.count, 0);

  if (ty.bankNet > EPSILON)
    rows.push({
      key: "ty-bank",
      label: "Trendyol · bankaya",
      count: tyCount("online"),
      amount: ty.bankNet,
      color: "#f97316",
      icon: Landmark,
      scope: scopeFromKey("ty-bank"),
      subs: tySub("online"),
      subNote: "Tutarlar brüt; satırdaki rakam komisyon ve yemek kartı kesintisi sonrası net.",
    });
  if (ty.onsiteNet > EPSILON)
    rows.push({
      key: "ty-door",
      label: "Trendyol · kapıda",
      count: tyCount("onsite"),
      amount: ty.onsiteNet,
      color: "#c2410c",
      icon: Hand,
      scope: scopeFromKey("ty-door"),
      subs: tySub("onsite"),
      subNote: "Tutarlar brüt; satırdaki rakam komisyon sonrası net.",
    });

  const local = [...report.localPaymentBreakdown]
    .filter((r) => r.amount > EPSILON)
    .sort((a, b) => METHOD_ORDER.indexOf(a.key) - METHOD_ORDER.indexOf(b.key));
  for (const r of local) {
    const m = METHOD_META[r.key] ?? METHOD_META.other;
    const subs: SubLine[] = [];
    // Yemek kartı → marka marka (kendi siparişler).
    if (r.key === "meal_card") {
      const brands = new Map<string, SubLine>();
      for (const o of orders) {
        if (o.channel !== "own" || o.method !== "meal_card" || o.status === "cancelled") continue;
        const b = o.mealCardBrand ?? "Belirtilmemiş";
        const s = brands.get(b) ?? {
          label: b,
          count: 0,
          amount: 0,
          scope: scopeFromKey(`own-meal-${b}`),
        };
        s.count++;
        s.amount += o.total;
        brands.set(b, s);
      }
      subs.push(...[...brands.values()].sort((a, b) => b.amount - a.amount));
    }
    const isMeal = r.key === "meal_card";
    const cut = isMeal ? ownNet(report).mealCut : 0;
    rows.push({
      key: `own-${r.key}`,
      label: `Kendi · ${m.short}`,
      count: r.count,
      amount: r.amount - cut,
      color: m.color,
      icon: m.icon,
      scope: scopeFromKey(`own-${r.key}`),
      subs,
      subNote: isMeal
        ? `Brüt ${formatCurrency(r.amount)} − %${Math.round(MEAL_CARD_PROVIDER_CUT * 100)} kart kesintisi ${formatCurrency(cut)}. Kasa sayımında brüt girilir.`
        : undefined,
    });
  }

  return rows;
}

// Kurumsal fişler açık hesaptır: o gün kasaya girmez → "eline geçen net"e
// katılmaz, defterin altında ayrı satır olarak gösterilir.
function buildCorporateRow(report: EndOfDayReport): Row | null {
  if (report.corporateTotal <= EPSILON) return null;
  return {
    key: "corp",
    label: "Kurumsal",
    count: report.corporateVoucherCount,
    amount: report.corporateTotal,
    color: "#64748b",
    icon: Building2,
    subs: report.corporateBreakdown.map((c) => ({ label: c.name, count: c.count, amount: c.amount })),
    subNote:
      report.corporateOpen > EPSILON ? `${formatCurrency(report.corporateOpen)} henüz tahsil edilmedi.` : undefined,
  };
}
