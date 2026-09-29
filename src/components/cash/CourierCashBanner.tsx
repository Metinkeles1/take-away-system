"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Wallet } from "lucide-react";

import { getMyCourierCash } from "@/actions/courierCash";
import { subscribeOrders } from "@/lib/pusher/client";
import { cn, formatCurrency } from "@/lib/utils";

type State = Awaited<ReturnType<typeof getMyCourierCash>> & { courier: string };

// Kurye ekranı şeridi: kuryenin üzerindeki (kasaya teslim edilmemiş) para.
// Nakit eşiği ya da bekleme süresi aşılınca kırmızı "Kasaya uğra" olur.
export function CourierCashBanner({ courier }: { courier: string | null }) {
  const [state, setState] = useState<State | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Hata sessiz — bir sonraki tazelemede denenir.
  const load = useCallback(() => {
    if (courier) getMyCourierCash(courier).then((s) => setState({ ...s, courier }), () => {});
  }, [courier]);

  useEffect(() => {
    load();
    let burst: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeOrders(() => {
      if (burst) return;
      burst = setTimeout(() => {
        burst = null;
        load();
      }, 800);
    });
    const t = setInterval(() => {
      setNow(Date.now());
      if (!document.hidden) load();
    }, 60_000);
    return () => {
      unsub();
      clearInterval(t);
      if (burst) clearTimeout(burst);
    };
  }, [load]);

  // Kurye değişince önceki kuryenin rakamı görünmesin.
  if (!courier || !state || state.courier !== courier || state.orderCount === 0) return null;

  const waitMin = state.oldestCashAt
    ? Math.floor((now - new Date(state.oldestCashAt).getTime()) / 60000)
    : 0;
  const warn =
    state.cash > 0 && (state.cash >= state.alert.amount || waitMin >= state.alert.minutes);

  return (
    <div
      className={cn(
        "shrink-0 border-b px-4 py-2 text-sm",
        warn ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 bg-white/70 text-slate-700",
      )}
    >
      <div className="mx-auto flex max-w-md items-center gap-2">
        {warn ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Wallet className="h-4 w-4 shrink-0 text-slate-500" />}
        <p className="min-w-0 flex-1 truncate">
          {warn ? <b>Kasaya uğra — </b> : "Üzerindeki: "}
          <b className="tabular-nums">{formatCurrency(state.cash)}</b> nakit
          {state.card > 0 && (
            <>
              {" · "}
              <span className="tabular-nums">{formatCurrency(state.card)}</span> kart
            </>
          )}
        </p>
        <span className={cn("shrink-0 text-xs tabular-nums", warn ? "text-white/80" : "text-slate-500")}>
          {state.orderCount} sipariş
        </span>
      </div>
    </div>
  );
}
