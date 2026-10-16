"use client";

import { useMemo, useState } from "react";
import { Ban, Bike, Building2, ChevronDown, Clock, Hand, Landmark, ListFilter, Receipt } from "lucide-react";

import type { EndOfDayComparison, EndOfDayOrder, EndOfDayReport } from "@/actions/endOfDay";
import type { TrendyolCategoryEarning } from "@/actions/trendyolDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { MEAL_CARD_PROVIDER_CUT } from "@/lib/commission";
import { cn, formatCurrency } from "@/lib/utils";

import {
  EPSILON,
  METHOD_META,
  METHOD_ORDER,
  isLate,
  ownNet,
  orderParts,
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

// Satır açılınca gösterilen hesap: ödenen → kesintiler → net.
interface Step {
  label: string;
  amount: number; // negatif = kesinti
  total?: boolean; // sonuç satırı (kalın, üstü çizgili)
}

interface Row {
  key: string;
  label: string;
  count: number | null;
  amount: number;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  scope?: LedgerScope;
  steps?: Step[];
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
  // İptal edilen siparişlerin tutarı — toplama girmeyen, bilgi amaçlı.
  const cancelledAmount = orders.reduce((s, o) => (o.status === "cancelled" ? s + o.total : s), 0);
  const cuts = dayCuts(report);
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
          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60 sm:min-h-0 sm:gap-2.5 sm:px-3"
        >
          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
          <Icon className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
          <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
          {r.count != null && (
            <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">{r.count}</span>
          )}
          <span className="text-right font-semibold whitespace-nowrap tabular-nums sm:w-24">{formatCurrency(r.amount)}</span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
              open && "rotate-180",
              r.subs.length === 0 && !r.subNote && !r.steps && "invisible",
            )}
          />
        </button>
        {open && (r.subs.length > 0 || r.subNote || r.steps) && (
          <div className="flex flex-col pr-2 pb-1.5 pl-6 sm:pr-8 sm:pl-10">
            {r.steps && <Steps steps={r.steps} className="px-2 pb-1.5" />}
            {r.subs.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={!s.scope}
                onClick={() => s.scope && select(s.scope)}
                className={cn(
                  "flex min-h-9 items-center gap-2 rounded px-2 py-1 text-left text-xs sm:min-h-0",
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
              title={`Geçen hafta aynı gün ciro: ${formatCurrency(comparison!.totalRevenue)}`}
            >
              {change > 0 ? "▲" : change < 0 ? "▼" : ""} %{Math.abs(change)} geçen haftaya göre
            </span>
          )}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {report.packageCount} paket · ort. sepet {formatCurrency(report.avgBasket)}
          {avgDur != null && ` · ort. teslim ${Math.round(avgDur)} dk`}
        </span>
        <div className="mt-2 flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2 sm:grid sm:grid-cols-3 sm:gap-2 sm:bg-transparent sm:p-0">
          <Stat label="Ciro" hint="Müşterilerin ödediği" value={cuts.revenue} />
          <Stat label="Trendyol kesintisi" hint="Komisyon" value={-cuts.commission} />
          <Stat label="Yemek k. kesintisi" hint="Sağlayıcı %10" value={-cuts.mealCut} />
        </div>
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

      <ReceiptCard
        report={report}
        orders={orders}
        active={selected === "ty-receipt"}
        onShowOrders={() => select(scopeFromKey("ty-receipt"))}
      />

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
          value={
            report.cancelledCount > 0
              ? cancelledAmount > EPSILON
                ? `${report.cancelledCount} · ${formatCurrency(cancelledAmount)}`
                : String(report.cancelledCount)
              : null
          }
          active={filter.state === "cancelled"}
          onClick={() =>
            onFilter({ ...filter, scope: undefined, state: filter.state === "cancelled" ? undefined : "cancelled" })
          }
        />
      </div>
    </div>
  );
}

// Trendyol ödeme türünün hesabı: müşterinin ödediği → komisyon → yemek kartı
// sağlayıcı kesintisi → sana geçen net. customerPaid yoksa (eski snapshot)
// indirimsiz tutara düşülür; o durumda "komisyon" kampanya indirimini de içerir.
interface CatBreak {
  count: number;
  paid: number;
  discount: number; // restoranın kampanya indirimi (ödenen tutara zaten yansımış)
  commission: number;
  providerCut: number;
  net: number;
}

function catBreak(c: TrendyolCategoryEarning | undefined): CatBreak {
  if (!c) return { count: 0, paid: 0, discount: 0, commission: 0, providerCut: 0, net: 0 };
  const paid = c.customerPaid ?? c.gross;
  return {
    count: c.count,
    paid,
    discount: Math.max(c.gross - paid, 0),
    commission: Math.max(paid - c.trendyolNet, 0),
    providerCut: Math.max(c.trendyolNet - c.bankNet, 0),
    net: c.bankNet,
  };
}

function addBreak(a: CatBreak, b: CatBreak): CatBreak {
  return {
    count: a.count + b.count,
    paid: a.paid + b.paid,
    discount: a.discount + b.discount,
    commission: a.commission + b.commission,
    providerCut: a.providerCut + b.providerCut,
    net: a.net + b.net,
  };
}

function tyBreaks(report: EndOfDayReport) {
  const e = report.trendyol?.available ? report.trendyol.earnings : null;
  return {
    card: catBreak(e?.creditCard),
    ticket: catBreak(e?.ticket),
    door: catBreak(e?.onDelivery),
    hasEarnings: !!e,
  };
}

// Günün kesinti özeti (başlıktaki üç rakam).
function dayCuts(report: EndOfDayReport) {
  const t = tyBreaks(report);
  const all = addBreak(addBreak(t.card, t.ticket), t.door);
  return {
    revenue: report.totalRevenue,
    commission: all.commission,
    mealCut: all.providerCut + ownNet(report).mealCut,
  };
}

function Stat({ label, hint, value }: { label: string; hint: string; value: number }) {
  return (
    <div
      className="flex min-w-0 items-baseline justify-between gap-2 sm:flex-col sm:items-stretch sm:gap-0 sm:rounded-lg sm:bg-muted/50 sm:px-2 sm:py-1.5"
      title={hint}
    >
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold whitespace-nowrap tabular-nums sm:truncate",
          value < 0 && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value < 0 ? `−${formatCurrency(-value)}` : formatCurrency(value)}
      </span>
    </div>
  );
}

function Steps({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 text-xs", className)}>
      {steps.map((st) => (
        <div
          key={st.label}
          className={cn(
            "flex justify-between gap-3",
            st.total ? "mt-0.5 border-t pt-1 font-semibold" : "text-muted-foreground",
          )}
        >
          <span className="min-w-0">{st.label}</span>
          <span className="whitespace-nowrap tabular-nums">
            {st.amount < 0 ? `−${formatCurrency(-st.amount)}` : formatCurrency(st.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Ödenen → kesintiler → net adımları; sıfır kesintiler gösterilmez.
function breakSteps(b: CatBreak, paidLabel: string, netLabel: string, cutLabel = "Yemek kartı kesintisi (%10)"): Step[] {
  const steps: Step[] = [{ label: paidLabel, amount: b.paid }];
  if (b.commission > EPSILON) steps.push({ label: "Trendyol komisyonu", amount: -b.commission });
  if (b.providerCut > EPSILON) steps.push({ label: cutLabel, amount: -b.providerCut });
  steps.push({ label: netLabel, amount: b.net, total: true });
  return steps;
}

// Gün sonu toplu nakit fiş — yalnız Trendyol ONLINE kredi kartı siparişleri.
// Yemek kartı (online/kod) ve kapıda ödemeler fişe girmez. Fiş tutarı = müşterinin
// ödediği (indirimsiz tutar − restoran kampanya indirimi). Rapor bunu taşımıyorsa
// (eski snapshot) sipariş arşivinden toplanır. Kapalı gelir (yer kaplamasın);
// tıklayınca fişten bankaya köprü dökümü ve "siparişleri göster" açılır.
function ReceiptCard({
  report,
  orders,
  active,
  onShowOrders,
}: {
  report: EndOfDayReport;
  orders: EndOfDayOrder[];
  active: boolean;
  onShowOrders: () => void;
}) {
  const [open, setOpen] = useState(false);
  const cc = report.trendyol?.available ? report.trendyol.earnings?.creditCard : undefined;
  const fromOrders = useMemo(() => {
    let paid = 0;
    let discount = 0;
    let count = 0;
    for (const o of orders) {
      if (o.channel !== "trendyol" || o.method !== "online" || o.status === "cancelled") continue;
      paid += o.total;
      discount += o.discount;
      count++;
    }
    return { paid, discount, count };
  }, [orders]);
  if (!cc || cc.count === 0) return null;

  const paid = cc.customerPaid ?? (fromOrders.count > 0 ? fromOrders.paid : cc.gross);
  const discount = cc.customerPaid != null ? cc.gross - cc.customerPaid : fromOrders.discount;
  const steps: Step[] = [
    { label: "Sipariş tutarı (indirimsiz)", amount: paid + discount },
    ...(discount > EPSILON ? [{ label: "Kampanya indirimi", amount: -discount }] : []),
    { label: "Fiş tutarı · müşterinin ödediği", amount: paid, total: true },
    { label: "Trendyol komisyonu", amount: -Math.max(paid - cc.trendyolNet, 0) },
    { label: "Kredi kartından bankaya", amount: cc.trendyolNet, total: true },
  ];
  return (
    <div
      className={cn(
        "mx-4 mt-4 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
        active && "ring-2 ring-amber-400",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Receipt className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm leading-tight font-medium">Nakit fiş kesilecek</span>
          <span className="text-xs text-muted-foreground">Online kart · {cc.count} sipariş</span>
        </span>
        <span className="text-base font-bold whitespace-nowrap tabular-nums sm:text-lg">{formatCurrency(paid)}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-amber-300/60 px-3 pt-2 pb-3 dark:border-amber-800/60">
          <Steps steps={steps} />
          <p className="text-xs text-muted-foreground">
            Fişi müşterinin ödediği tutara kes. Yemek kartı ve kapıda ödemeler fişe girmez.
          </p>
          <button
            type="button"
            onClick={onShowOrders}
            className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-2 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950/70"
          >
            <ListFilter className="size-3.5" />
            {active ? "Liste filtresini kaldır" : "Siparişleri listede göster"}
          </button>
        </div>
      )}
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
        "flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm sm:min-h-0",
        onClick && "hover:bg-muted/60",
        active && "bg-muted ring-1 ring-border",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", color)} />
      <span className="min-w-0 flex-1 text-muted-foreground sm:truncate">{label}</span>
      <span className={cn("shrink-0 font-semibold whitespace-nowrap tabular-nums", color)}>{value}</span>
    </button>
  );
}

// Defter satırları: Trendyol (bankaya / kapıda) → kendi yöntemler → kurumsal.
function buildRows(report: EndOfDayReport, orders: EndOfDayOrder[]): Row[] {
  const rows: Row[] = [];
  const ty = trendyolNet(report.trendyol);
  const tb = tyBreaks(report);
  const bank = addBreak(tb.card, tb.ticket);
  const lines = report.trendyol?.lines ?? [];
  const tyCount = (group: "online" | "onsite") =>
    lines.filter((l) => l.group === group).reduce((s, l) => s + l.count, 0);
  const discountNote = (d: number) =>
    d > EPSILON ? `Kampanya indirimi ${formatCurrency(d)} müşterinin ödediğinden zaten düşülü.` : undefined;

  if (ty.bankNet > EPSILON)
    rows.push({
      key: "ty-bank",
      label: "Trendyol · bankaya",
      count: tyCount("online") || bank.count,
      amount: ty.bankNet,
      color: "#f97316",
      icon: Landmark,
      scope: scopeFromKey("ty-bank"),
      steps: tb.hasEarnings ? breakSteps(bank, "Müşterilerin ödediği", "Bankaya yatacak") : undefined,
      subs: tySubs(orders, false),
      subNote: discountNote(bank.discount),
    });
  if (ty.onsiteNet > EPSILON)
    rows.push({
      key: "ty-door",
      label: "Trendyol · kapıda",
      count: tyCount("onsite") || tb.door.count,
      amount: ty.onsiteNet,
      color: "#c2410c",
      icon: Hand,
      scope: scopeFromKey("ty-door"),
      steps: tb.hasEarnings
        ? breakSteps(tb.door, "Kapıda alınan", "Sana kalan net", "Kodla yemek kartı kesintisi (%10)")
        : undefined,
      subs: tySubs(orders, true),
      subNote: discountNote(tb.door.discount),
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
        if (o.channel !== "own" || o.status === "cancelled") continue;
        // Bölünmüş ödemede yalnız yemek kartı parçası sayılır.
        for (const part of orderParts(o)) {
          if (part.method !== "meal_card") continue;
          const b = part.mealCardBrand ?? "Belirtilmemiş";
          const s = brands.get(b) ?? {
            label: b,
            count: 0,
            amount: 0,
            scope: scopeFromKey(`own-meal-${b}`),
          };
          s.count++;
          s.amount += part.amount;
          brands.set(b, s);
        }
      }
      subs.push(...[...brands.values()].sort((a, b) => b.amount - a.amount));
    }
    const isMeal = r.key === "meal_card";
    const cut = isMeal ? ownNet(report).mealCut : 0;
    const steps: Step[] | undefined = isMeal
      ? [
          { label: "Müşterilerin ödediği", amount: r.amount },
          { label: `Yemek kartı kesintisi (%${Math.round(MEAL_CARD_PROVIDER_CUT * 100)})`, amount: -cut },
          { label: "Sana kalan net", amount: r.amount - cut, total: true },
        ]
      : undefined;
    rows.push({
      key: `own-${r.key}`,
      label: `Kendi · ${m.short}`,
      count: r.count,
      amount: r.amount - cut,
      color: m.color,
      icon: m.icon,
      scope: scopeFromKey(`own-${r.key}`),
      steps,
      subs,
      subNote: isMeal ? "Kasa sayımında kesintisiz tutar girilir." : undefined,
    });
  }

  return rows;
}

// Trendyol alt satırları — sipariş arşivinden, müşterinin ödediği tutarla.
// onDoor=false → bankaya (online kart + online yemek kartı); true → kapıda.
function tySubs(orders: EndOfDayOrder[], onDoor: boolean): SubLine[] {
  const map = new Map<string, SubLine>();
  for (const o of orders) {
    if (o.channel !== "trendyol" || o.status === "cancelled" || o.onDoor !== onDoor) continue;
    const label =
      o.method === "meal_card"
        ? `Yemek kartı · ${o.mealCardBrand ?? "Diğer"}${onDoor ? " (kod)" : ""}`
        : o.method === "online"
          ? "Online kart"
          : (METHOD_META[o.method] ?? METHOD_META.other).short;
    const sub = map.get(label) ?? {
      label,
      count: 0,
      amount: 0,
      scope: o.method === "online" ? scopeFromKey("ty-receipt") : undefined,
    };
    sub.count++;
    sub.amount += o.total;
    map.set(label, sub);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
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
