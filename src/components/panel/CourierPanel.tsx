"use client";

import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, Banknote, ChevronRight, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CourierCashRow, CourierCashState } from "@/actions/courierCash";
import { cn, formatCurrencyShort } from "@/lib/utils";
import type { Order } from "@/types";
import { handOverCash } from "./orderActions";

interface Row {
  name: string; // "" = kurye belirtilmeden teslim edilmiş
  onRoad: number;
  carrying: Order[]; // üzerindeki paketler — en eski önce
  cash: CourierCashRow | null;
  alert: boolean;
}

// Telefonda para dökümü alttan açılır (başparmağa yakın), geniş ekranda sağdan.
const WIDE = "(min-width: 768px)";
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

const sinceMin = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));

function buildRows(couriers: string[], orders: Order[], cash: CourierCashState | null, now: number): Row[] {
  const names = new Set(couriers);
  cash?.rows.forEach((r) => names.add(r.courier));
  orders.forEach((o) => o.courier && names.add(o.courier));
  const alert = cash?.alert;

  return [...names]
    .map((name) => {
      const c = cash?.rows.find((r) => r.courier === name) ?? null;
      return {
        name,
        onRoad: orders.filter((o) => o.courier === name).length,
        carrying: orders
          .filter((o) => o.courier === name)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        cash: c,
        alert: !!c && !!alert && (c.cash >= alert.amount || sinceMin(c.oldestAt, now) >= alert.minutes),
      };
    })
    .sort((a, b) => Number(b.alert) - Number(a.alert) || (b.cash?.cash ?? 0) + (b.cash?.card ?? 0) - ((a.cash?.cash ?? 0) + (a.cash?.card ?? 0)) || b.onRoad - a.onRoad || a.name.localeCompare(b.name, "tr"));
}

export function CourierPanel({
  couriers,
  orders,
  cash,
  now,
  onChanged,
}: {
  couriers: string[];
  orders: Order[];
  cash: CourierCashState | null;
  now: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = buildRows(couriers, orders, cash, now);
  const selected = open === null ? null : (rows.find((r) => r.name === open) ?? null);

  return (
    <>
      <div className="min-h-0 flex-1 divide-y overflow-y-auto">
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Kurye yok — Ayarlar’dan ekleyin</p>
        )}
        {rows.map((r) => {
          const total = (r.cash?.cash ?? 0) + (r.cash?.card ?? 0);
          return (
            <button
              key={r.name || "_"}
              type="button"
              onClick={() => setOpen(r.name)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  r.onRoad > 0 ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" : "bg-muted text-muted-foreground",
                )}
              >
                {(r.name || "?")[0].toLocaleUpperCase("tr")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.name || "Kuryesiz teslim"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.onRoad > 0 ? (
                    <>
                      {r.carrying.map((o) => `#${o.source === "trendyol" ? (o.orderCode ?? String(o.orderNumber)).slice(-5) : o.orderNumber}`).join(" ")}
                      <span className="text-muted-foreground/70">
                        {" "}· en eski {Math.max(0, Math.floor((now - new Date(r.carrying[0].createdAt).getTime()) / 60000))} dk
                      </span>
                    </>
                  ) : (
                    "Boşta"
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {total > 0 ? (
                  <>
                    <p className={cn("text-sm font-bold tabular-nums", r.alert && "text-rose-600 dark:text-rose-400")}>
                      {formatCurrencyShort(total)}
                    </p>
                    <p className={cn("flex items-center justify-end gap-1 text-xs", r.alert ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                      {r.alert && <AlertTriangle className="size-3" />}
                      {r.cash!.orderCount} teslim
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Para yok</p>
                )}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
            </button>
          );
        })}
      </div>

      <CashSheet row={selected} now={now} onClose={() => setOpen(null)} onChanged={onChanged} />
    </>
  );
}

// Kuryenin üzerindeki paranın sipariş sipariş dökümü + "teslim aldım".
function CashSheet({
  row,
  now,
  onClose,
  onChanged,
}: {
  row: Row | null;
  now: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const wide = useWide();
  const [busy, setBusy] = useState<string | null>(null);
  const items = row?.cash?.orders ?? [];

  const take = async (refs: typeof items, key: string) => {
    if (!row) return;
    setBusy(key);
    try {
      const res = await handOverCash(row.name, refs);
      if (res.ok) {
        const sum = refs.reduce((s, o) => s + o.amount, 0);
        toast.success(`${row.name || "Kuryesiz"} — ${formatCurrencyShort(sum)} teslim alındı`);
      } else toast.error(res.error ?? "Kaydedilemedi");
      onChanged();
    } catch {
      toast.error("Kaydedilemedi");
    } finally {
      setBusy(null);
    }
  };

  const cashOnly = items.filter((o) => o.cash > 0);
  const mixed = cashOnly.length > 0 && cashOnly.length < items.length;

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={wide ? "right" : "bottom"}
        className={cn("gap-0 p-0", wide ? "w-full sm:max-w-md" : "max-h-[85dvh] rounded-t-2xl")}
      >
        {row && (
          <>
            <SheetHeader className="border-b p-4">
              <SheetTitle>{row.name || "Kuryesiz teslim"}</SheetTitle>
              <SheetDescription>
                {row.onRoad > 0 ? `${row.onRoad} paket üzerinde · ` : ""}
                kasaya teslim edilmemiş para
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-2 divide-x border-b">
              <div className="px-4 py-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Banknote className="size-3.5 text-emerald-600" /> Nakit
                </p>
                <p className="text-lg font-bold tabular-nums">{formatCurrencyShort(row.cash?.cash ?? 0)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CreditCard className="size-3.5 text-sky-600" /> Kapıda kart
                </p>
                <p className="text-lg font-bold tabular-nums">{formatCurrencyShort(row.cash?.card ?? 0)}</p>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="flex-1 px-4 py-12 text-center text-sm text-muted-foreground">Üzerinde teslim edilmemiş para yok</p>
            ) : (
              <>
                <div className="min-h-0 flex-1 divide-y overflow-y-auto">
                  {items.map((o) => {
                    const key = `${o.source}:${o.ref}`;
                    return (
                      <div key={key} className="flex items-center gap-3 px-4 py-2.5">
                        {o.method === "cash" ? (
                          <Banknote className="size-4 shrink-0 text-emerald-600" />
                        ) : (
                          <CreditCard className="size-4 shrink-0 text-sky-600" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm">
                            <span
                              className={cn("size-1.5 shrink-0 rounded-full", o.source === "trendyol" ? "bg-orange-500" : "bg-sky-500")}
                            />
                            <span className="font-semibold tabular-nums">#{o.orderNumber.slice(-5)}</span>
                            <span className="truncate text-muted-foreground">{o.customer}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {sinceMin(o.deliveredAt, now)} dk önce teslim
                            {o.split && o.cash > 0 && o.card > 0 &&
                              ` · Nakit ${formatCurrencyShort(o.cash)} + Kart ${formatCurrencyShort(o.card)}`}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrencyShort(o.amount)}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-10 shrink-0 px-3 md:h-8 md:px-2"
                          disabled={busy !== null}
                          onClick={() => void take([o], key)}
                        >
                          {busy === key ? <Loader2 className="size-3.5 animate-spin" /> : "Aldım"}
                        </Button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2 border-t p-4">
                  <Button className="h-11" disabled={busy !== null} onClick={() => void take(items, "all")}>
                    {busy === "all" && <Loader2 className="size-4 animate-spin" />}
                    Hepsini teslim aldım · {formatCurrencyShort(items.reduce((s, o) => s + o.amount, 0))}
                  </Button>
                  {mixed && (
                    <Button variant="outline" className="h-11" disabled={busy !== null} onClick={() => void take(cashOnly, "cash")}>
                      Sadece nakiti aldım · {formatCurrencyShort(cashOnly.reduce((s, o) => s + o.cash, 0))}
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
