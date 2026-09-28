"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { tr } from "react-day-picker/locale";

import { type DashboardPeriod } from "@/lib/dashboardPeriods";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Komuta tarih seçici — ortadaki tarihe tıkla → takvimden günü seç. Dönem
// pencereleri (lib/dashboardPeriods) İstanbul gününe göre: gün = takvim günü,
// hafta = son 7 gün, ay = son 30 gün (kayan). Hafta/Ay'da seçilen gün hangi
// pencereye düşüyorsa o açılır; pencere takvimde işaretli görünür.

const DAY_MS = 86_400_000;
const MAX_DAY_OFFSET = 365;
const SPAN: Record<DashboardPeriod, number> = { day: 1, week: 7, month: 30 };

// İstanbul takvim günü, UTC gece yarısı olarak.
function istanbulToday(): number {
  const ist = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
}

// Takvim (DayPicker) yerel Date ister; gün kimliği UTC gece yarısı.
const toLocal = (t: number) => {
  const d = new Date(t);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const fromLocal = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

const fmt = (t: number, opts: Intl.DateTimeFormatOptions) =>
  new Date(t).toLocaleDateString("tr-TR", { ...opts, timeZone: "UTC" });

// offset'inci pencerenin ilk ve son günü (ikisi dahil).
function windowDays(period: DashboardPeriod, offset: number) {
  const span = SPAN[period];
  const end = istanbulToday() - offset * span * DAY_MS;
  return { start: end - (span - 1) * DAY_MS, end };
}

export function komutaPeriodLabel(period: DashboardPeriod, offset: number): string {
  if (period === "day") {
    const d = istanbulToday() - offset * DAY_MS;
    const date = fmt(d, { day: "numeric", month: "short" });
    if (offset === 0) return `Bugün · ${date}`;
    if (offset === 1) return `Dün · ${date}`;
    return fmt(d, { weekday: "short", day: "numeric", month: "short" });
  }
  if (offset === 0) return period === "week" ? "Son 7 gün" : "Son 30 gün";
  const { start, end } = windowDays(period, offset);
  const sameMonth = new Date(start).getUTCMonth() === new Date(end).getUTCMonth();
  return sameMonth
    ? `${new Date(start).getUTCDate()}–${fmt(end, { day: "numeric", month: "short" })}`
    : `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short" })}`;
}

export function KomutaDatePicker({
  period,
  offset,
  maxOffset,
  onChange,
}: {
  period: DashboardPeriod;
  offset: number;
  maxOffset: number;
  onChange: (offset: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = istanbulToday();
  const { start, end } = windowDays(period, offset);
  const oldest = today - Math.min(MAX_DAY_OFFSET, (maxOffset + 1) * SPAN[period] - 1) * DAY_MS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-full min-w-32 items-center justify-center gap-1.5 border-x px-2.5 text-xs font-semibold transition-colors hover:bg-muted"
          aria-label="Tarih seç"
          title="Tarih seç"
        >
          <CalendarDays className="size-3.5 text-muted-foreground" />
          {komutaPeriodLabel(period, offset)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={tr}
          selected={toLocal(end)}
          defaultMonth={toLocal(end)}
          startMonth={toLocal(oldest)}
          endMonth={toLocal(today)}
          disabled={{ before: toLocal(oldest), after: toLocal(today) }}
          modifiers={period === "day" ? undefined : { inWindow: { from: toLocal(start), to: toLocal(end) } }}
          modifiersClassNames={{ inWindow: "bg-muted rounded-none first:rounded-l-md last:rounded-r-md" }}
          onDayClick={(day, mods) => {
            if (mods.disabled) return;
            const daysAgo = Math.round((today - fromLocal(day)) / DAY_MS);
            onChange(Math.min(maxOffset, Math.floor(daysAgo / SPAN[period])));
            setOpen(false);
          }}
        />
        <div className="flex gap-1.5 border-t p-2">
          {(period === "day"
            ? [
                { label: "Bugün", o: 0 },
                { label: "Dün", o: 1 },
                { label: "Geçen hafta bugün", o: 7 },
              ]
            : [
                { label: period === "week" ? "Son 7 gün" : "Son 30 gün", o: 0 },
                { label: "Önceki dönem", o: 1 },
              ]
          ).map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                onChange(q.o);
                setOpen(false);
              }}
              className="rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted aria-pressed:border-foreground/30 aria-pressed:bg-muted"
              aria-pressed={offset === q.o}
            >
              {q.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
