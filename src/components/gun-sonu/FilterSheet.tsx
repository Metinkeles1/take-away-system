"use client";

import { useMemo, useState } from "react";

import type { EndOfDayOrder } from "@/actions/endOfDay";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  ADV_STATUS_LABEL,
  METHOD_META,
  METHOD_ORDER,
  NO_BRAND,
  SORT_LABEL,
  cleanAdv,
  isLate,
  matchesFilter,
  orderParts,
  parseAmount,
  type AdvStatus,
  type AdvancedFilter,
  type OrderFilter,
  type SortKey,
} from "./meta";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orders: EndOfDayOrder[];
  filter: OrderFilter;
  onFilterChange: (f: OrderFilter) => void;
  targetMin: number;
}

const TIME_PRESETS = [
  { label: "Öğle", from: "11:00", to: "15:00" },
  { label: "Akşam", from: "17:00", to: "22:00" },
  { label: "Gece", from: "22:00", to: "04:00" },
];

const DISTRICT_LIMIT = 12;

// Detaylı filtre paneli. Seçimler önce panelin kendi taslağında tutulur, panel
// kapanınca (Göster / × / dışarı dokunma) tek seferde uygulanır — her dokunuşta
// arkadaki defter + liste + adres çubuğu yeniden çizilip mobilde kasmasın.
// Gövde yalnız panel açıkken çizilir → seçenek sayımı kapalıyken hiç çalışmaz.
export function FilterSheet({ open, onOpenChange, orders, filter, onFilterChange, targetMin }: Props) {
  const [draft, setDraft] = useState(filter);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Her açılışta taslak güncel filtreden başlar.
    setWasOpen(open);
    if (open) setDraft(filter);
  }
  const close = () => {
    if (draft !== filter) onFilterChange(draft);
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Filtrele</SheetTitle>
          <SheetDescription>Bir gruptan birden fazla seçebilirsin. Panel kapanınca uygulanır.</SheetDescription>
        </SheetHeader>
        {open && (
          <FilterBody orders={orders} filter={draft} onFilterChange={setDraft} targetMin={targetMin} onClose={close} />
        )}
      </SheetContent>
    </Sheet>
  );
}

// Seçenekler o günün siparişlerinden türetilir; yanlarındaki sayı iptal hariç adettir.
function FilterBody({
  orders,
  filter,
  onFilterChange,
  targetMin,
  onClose,
}: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  // Taslağın sonucu — uygulamadan önce kaç sipariş kalacağını gösterir (~50 sipariş, ucuz).
  const resultCount = useMemo(
    () => orders.filter((o) => matchesFilter(o, filter, targetMin)).length,
    [orders, filter, targetMin],
  );
  const a = filter.adv ?? {};
  const setAdv = (patch: Partial<AdvancedFilter>) => onFilterChange({ ...filter, adv: cleanAdv({ ...a, ...patch }) });
  const toggle = <T,>(list: T[] | undefined, v: T) =>
    list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v];
  const [allDistricts, setAllDistricts] = useState(false);

  const opts = useMemo(() => {
    const methods = new Map<string, number>();
    const brands = new Map<string, number>();
    const districts = new Map<string, number>();
    const statuses: Record<AdvStatus, number> = { delivered: 0, active: 0, open: 0, late: 0, cancelled: 0 };
    for (const o of orders) {
      if (o.status === "cancelled") {
        statuses.cancelled++;
        continue;
      }
      statuses[o.status]++;
      if (o.open) statuses.open++;
      if (isLate(o, targetMin)) statuses.late++;
      for (const p of orderParts(o)) {
        methods.set(p.method, (methods.get(p.method) ?? 0) + 1);
        if (p.method === "meal_card") {
          const b = p.mealCardBrand ?? NO_BRAND;
          brands.set(b, (brands.get(b) ?? 0) + 1);
        }
      }
      if (o.district) districts.set(o.district, (districts.get(o.district) ?? 0) + 1);
    }
    const byCount = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1]);
    return {
      methods: [...methods.entries()].sort((x, y) => METHOD_ORDER.indexOf(x[0]) - METHOD_ORDER.indexOf(y[0])),
      brands: byCount(brands),
      districts: byCount(districts),
      statuses,
    };
  }, [orders, targetMin]);

  const districts = allDistricts ? opts.districts : opts.districts.slice(0, DISTRICT_LIMIT);
  // Seçili ama listede kısaltma yüzünden görünmeyen mahalleyi de göster.
  const hiddenSelected = (a.districts ?? []).filter((d) => !districts.some(([x]) => x === d));

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4">
        <Group title="Ödeme yöntemi">
          {opts.methods.map(([m, n]) => (
            <Chip
              key={m}
              active={!!a.methods?.includes(m)}
              onClick={() => setAdv({ methods: toggle(a.methods, m) })}
              dot={(METHOD_META[m] ?? METHOD_META.other).color}
              label={m === "online" ? "Online kart" : (METHOD_META[m] ?? METHOD_META.other).short}
              count={n}
            />
          ))}
        </Group>

        {opts.brands.length > 0 && (
          <Group title="Yemek kartı markası">
            {opts.brands.map(([b, n]) => (
              <Chip
                key={b}
                active={!!a.brands?.includes(b)}
                onClick={() => setAdv({ brands: toggle(a.brands, b) })}
                label={b}
                count={n}
              />
            ))}
          </Group>
        )}

        <Group title="Saat aralığı">
          {TIME_PRESETS.map((p) => {
            const active = a.from === p.from && a.to === p.to;
            return (
              <Chip
                key={p.label}
                active={active}
                onClick={() => setAdv(active ? { from: undefined, to: undefined } : { from: p.from, to: p.to })}
                label={`${p.label} ${p.from}–${p.to}`}
              />
            );
          })}
          <div className="flex w-full items-center gap-2 pt-1">
            <TimeInput value={a.from} onChange={(v) => setAdv({ from: v })} label="Başlangıç saati" />
            <span className="text-muted-foreground">–</span>
            <TimeInput value={a.to} onChange={(v) => setAdv({ to: v })} label="Bitiş saati" />
          </div>
        </Group>

        <Group title="Durum">
          {(Object.keys(ADV_STATUS_LABEL) as AdvStatus[]).map((s) => (
            <Chip
              key={s}
              active={!!a.statuses?.includes(s)}
              onClick={() => setAdv({ statuses: toggle(a.statuses, s) })}
              label={ADV_STATUS_LABEL[s]}
              count={opts.statuses[s]}
            />
          ))}
        </Group>

        <Group title="Tutar (₺)">
          <div className="flex w-full items-center gap-2">
            <AmountInput value={a.min} onChange={(v) => setAdv({ min: v })} placeholder="En az" />
            <span className="text-muted-foreground">–</span>
            <AmountInput value={a.max} onChange={(v) => setAdv({ max: v })} placeholder="En çok" />
          </div>
        </Group>

        {opts.districts.length > 0 && (
          <Group title="Mahalle">
            {[...districts, ...hiddenSelected.map((d) => [d, 0] as [string, number])].map(([d, n]) => (
              <Chip
                key={d}
                active={!!a.districts?.includes(d)}
                onClick={() => setAdv({ districts: toggle(a.districts, d) })}
                label={d}
                count={n || undefined}
              />
            ))}
            {opts.districts.length > DISTRICT_LIMIT && (
              <button
                type="button"
                onClick={() => setAllDistricts((v) => !v)}
                className="min-h-9 px-2 text-sm font-medium text-muted-foreground underline-offset-2 hover:underline sm:min-h-7 sm:text-xs"
              >
                {allDistricts ? "Daha az göster" : `Tümü (${opts.districts.length})`}
              </button>
            )}
          </Group>
        )}

        <Group title="Sıralama">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <Chip
              key={k}
              active={(filter.sort ?? "new") === k}
              onClick={() => onFilterChange({ ...filter, sort: k === "new" ? undefined : k })}
              label={SORT_LABEL[k]}
            />
          ))}
        </Group>
      </div>

      <div className="flex items-center gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <span className="flex-1 text-sm text-muted-foreground">
          <b className="text-foreground tabular-nums">{resultCount}</b> sipariş
        </span>
        <Button
          variant="ghost"
          onClick={() => onFilterChange({ ...filter, adv: undefined, sort: undefined })}
          disabled={!filter.adv && !filter.sort}
          className="h-10 sm:h-8"
        >
          Temizle
        </Button>
        <Button onClick={onClose} className="h-10 px-4 sm:h-8">
          Göster
        </Button>
      </div>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </section>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors sm:min-h-7 sm:px-2.5 sm:text-xs",
        active ? "border-foreground/30 bg-foreground/5 font-medium ring-1 ring-foreground/20" : "hover:bg-muted/60",
      )}
    >
      {dot && <span className="size-2 rounded-full" style={{ background: dot }} />}
      {label}
      {count != null && <span className="tabular-nums text-muted-foreground">{count}</span>}
    </button>
  );
}

function TimeInput({
  value,
  onChange,
  label,
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
  label: string;
}) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:text-sm"
    />
  );
}

// Yazarken metin olarak tutulur ("1.250,5" gibi ara hâller bozulmasın); geçerli
// sayı olunca filtreye yazılır.
function AmountInput({
  value,
  onChange,
  placeholder,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    // Dışarıdan değişti (Temizle / etiket kaldırma) → kutuyu eşitle.
    setPrev(value);
    if (parseAmount(text) !== (value ?? null)) setText(value != null ? String(value) : "");
  }
  return (
    <input
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseAmount(e.target.value) ?? undefined);
      }}
      className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:text-sm"
    />
  );
}
