"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bike, Check, Loader2, StickyNote, UserMinus, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatCurrencyShort } from "@/lib/utils";
import type { Order } from "@/types";
import { assignCourier, canDeliver, deliverOrder, releaseCourier } from "./orderActions";

const PAY_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  online: "Online",
  meal_card: "Yemek kartı",
  iban: "IBAN",
};

function payLabel(o: Order) {
  if (o.paymentStatus === "open") return "Açık hesap";
  if (o.payment?.prepaid) return "Online ödendi";
  return PAY_LABEL[o.payment?.method] ?? "—";
}

function itemsLine(o: Order) {
  return o.items.map((i) => `${i.quantity}× ${i.product?.name ?? "?"}`).join(", ");
}

export function ageMinutes(o: Order, now: number) {
  return Math.max(0, Math.floor((now - new Date(o.createdAt).getTime()) / 60000));
}

// Gecikme tonu teslim hedefine göre: hedefi geçti → kırmızı, 10 dk kala → sarı.
export function ageTone(min: number, target: number): "ok" | "warn" | "late" {
  if (min >= target) return "late";
  if (min >= target - 10) return "warn";
  return "ok";
}

export function PanelOrderCard({
  order,
  now,
  target,
  couriers,
  isNew = false,
  onChanged,
}: {
  order: Order;
  now: number;
  target: number;
  couriers: string[];
  isNew?: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Yeni gelen kart listenin altında kalmasın — görünür alana kaydır.
  useEffect(() => {
    if (isNew) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isNew]);

  // "Teslim" iki dokunuşla: ilki onay ister, 3 sn içinde basılmazsa geri döner.
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  const min = ageMinutes(order, now);
  const tone = ageTone(min, target);
  const ty = order.source === "trendyol";
  const no = ty ? (order.orderCode ?? String(order.orderNumber)).slice(-5) : order.orderNumber;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) toast.success(okMsg);
      else toast.error(res.error ?? "İşlem yapılamadı");
      onChanged();
    } catch {
      toast.error("İşlem yapılamadı");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const assign = (name: string) => {
    setPickOpen(false);
    if (name === order.courier) return;
    void run(() => assignCourier(order, name), `#${no} → ${name}`);
  };

  const deliverable = !!order.courier && canDeliver(order);
  const waitsShipping = !!order.courier && !deliverable; // Trendyol, yola çıkmamış

  return (
    <div
      ref={ref}
      className={cn(
        "relative rounded-lg border bg-card py-2 pl-3.5 pr-2 shadow-xs",
        tone === "late" && "border-rose-300 dark:border-rose-900",
        isNew && "border-sky-400 ring-2 ring-sky-400/30",
      )}
    >
      {/* Sol şerit: gecikme tonu */}
      <span
        className={cn(
          "absolute inset-y-2 left-1 w-1 rounded-full",
          tone === "late" ? "bg-rose-500" : tone === "warn" ? "bg-amber-400" : "bg-emerald-500/60",
        )}
      />

      <div className="flex items-start gap-2">
        <Link
          href={ty ? "/kurye" : `/orders/${order.id}`}
          className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="flex items-center gap-1.5 text-sm leading-5">
            <span
              className={cn("size-2 shrink-0 rounded-full", ty ? "bg-orange-500" : "bg-sky-500")}
              title={ty ? "Trendyol" : "Telefon"}
            />
            <span className="font-semibold tabular-nums">#{no}</span>
            <span className="truncate">{order.customer?.name || "—"}</span>
            {isNew && (
              <span className="shrink-0 rounded bg-sky-500 px-1.5 text-xs font-semibold leading-5 text-white">Yeni</span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {order.customer?.district && <span className="text-foreground/70">{order.customer.district} · </span>}
            {itemsLine(order)}
          </p>
          {order.notes && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-amber-700 dark:text-amber-400">
              <StickyNote className="size-3 shrink-0" />
              <span className="truncate">{order.notes}</span>
            </p>
          )}
        </Link>

        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-sm font-bold tabular-nums",
              tone === "late" && "text-rose-600 dark:text-rose-400",
              tone === "warn" && "text-amber-600 dark:text-amber-400",
            )}
          >
            {min} dk
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">{formatCurrencyShort(order.total)}</p>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs",
            order.paymentStatus === "open"
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Wallet className="size-3 shrink-0" />
          {payLabel(order)}
        </span>
        {ty && order.status === "on-the-way" && (
          <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs text-indigo-700 dark:text-indigo-400">Yolda</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Popover open={pickOpen} onOpenChange={setPickOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={busy}
                className={cn(
                  "inline-flex h-10 items-center gap-1 rounded-md border px-3 text-sm font-medium lg:h-7 lg:px-2 lg:text-xs transition-colors disabled:opacity-50",
                  order.courier
                    ? "bg-background hover:bg-muted"
                    : "border-dashed text-muted-foreground hover:border-solid hover:text-foreground",
                )}
              >
                <Bike className="size-3.5" />
                {order.courier || "Kurye ata"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              {couriers.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Ayarlar’dan kurye ekleyin</p>
              )}
              {couriers.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => assign(c)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2 py-2.5 text-sm hover:bg-muted lg:py-1.5",
                    c === order.courier && "font-semibold",
                  )}
                >
                  {c}
                  {c === order.courier && <Check className="size-3.5" />}
                </button>
              ))}
              {order.courier && (
                <button
                  type="button"
                  onClick={() => {
                    setPickOpen(false);
                    void run(() => releaseCourier(order), `#${no} havuza döndü`);
                  }}
                  className="mt-1 flex w-full items-center gap-1.5 border-t px-2 pb-1.5 pt-2.5 text-sm lg:pb-1 lg:pt-2 lg:text-xs text-muted-foreground hover:text-foreground"
                >
                  <UserMinus className="size-3.5" /> Kuryeden geri al
                </button>
              )}
            </PopoverContent>
          </Popover>

          {waitsShipping && (
            <span className="hidden text-xs text-muted-foreground sm:inline" title="Kurye uygulamada “Yola çıktım” deyince teslim edilebilir">
              yola çıkınca
            </span>
          )}
          {deliverable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => (confirm ? void run(() => deliverOrder(order), `#${no} teslim edildi`) : setConfirm(true))}
              className={cn(
                "inline-flex h-10 items-center gap-1 rounded-md px-3 text-sm font-semibold lg:h-7 lg:px-2 lg:text-xs transition-colors disabled:opacity-50",
                confirm
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400",
              )}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {confirm ? "Onayla" : "Teslim"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
