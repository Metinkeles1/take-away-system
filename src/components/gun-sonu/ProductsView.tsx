"use client";

import { useMemo } from "react";

import type { EndOfDayOrder } from "@/actions/endOfDay";
import { productKey } from "@/lib/performanceNames";
import { cn, formatCurrency } from "@/lib/utils";

import { EPSILON } from "./meta";

interface ProductRow {
  key: string;
  name: string;
  own: number; // adet
  trendyol: number; // adet
  gross: number;
  net: number;
  estimated: boolean; // Trendyol neti tahmini olan sipariş içeriyor
}

// Ürün kazancı — süzülen siparişlerin satırlarından. Trendyol'da sipariş neti
// (komisyon + satıcı indirimi düşülmüş) ürünlere tutar payına göre dağıtılır;
// kendi siparişte net = brüt. Çubuk: koyu = eline geçen, açık = kesinti.
export function ProductsView({ orders }: { orders: EndOfDayOrder[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, ProductRow & { names: Map<string, number> }>();
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      for (const it of o.items) {
        const k = productKey(it.name);
        const r =
          map.get(k) ??
          { key: k, name: it.name, own: 0, trendyol: 0, gross: 0, net: 0, estimated: false, names: new Map() };
        r[o.channel] += it.qty;
        r.gross += it.gross;
        r.net += it.net;
        if (o.channel === "trendyol" && o.netEstimated) r.estimated = true;
        // Görünen ad: en çok satılan yazım (kendi menü ve Trendyol farklı yazabilir).
        r.names.set(it.name, (r.names.get(it.name) ?? 0) + it.qty);
        map.set(k, r);
      }
    }
    return [...map.values()]
      .map(({ names, ...r }) => ({ ...r, name: [...names.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
      .sort((a, b) => b.net - a.net);
  }, [orders]);

  const max = Math.max(1, ...rows.map((r) => r.gross));
  const tot = rows.reduce(
    (s, r) => ({ qty: s.qty + r.own + r.trendyol, gross: s.gross + r.gross, net: s.net + r.net }),
    { qty: 0, gross: 0, net: 0 },
  );

  if (rows.length === 0)
    return <p className="py-16 text-center text-sm text-muted-foreground">Bu filtrede satılan ürün yok</p>;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 border-b bg-card px-3 py-2 text-xs text-muted-foreground">
        <span className="col-span-5">Ürün</span>
        <span className="col-span-1 text-right">Adet</span>
        <span className="col-span-3 text-right">Brüt</span>
        <span className="col-span-3 text-right">Eline geçen</span>
      </div>
      {rows.map((r) => {
        const cut = r.gross - r.net;
        return (
          <div key={r.key} className="grid grid-cols-12 items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
            <div className="col-span-5 min-w-0">
              <p className="truncate font-medium">{r.name}</p>
              <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted" title={`Kesinti ${formatCurrency(cut)}`}>
                <span className="h-full bg-emerald-500" style={{ width: `${(r.net / max) * 100}%` }} />
                {cut > EPSILON && (
                  <span className="h-full bg-orange-300 dark:bg-orange-400/50" style={{ width: `${(cut / max) * 100}%` }} />
                )}
              </div>
            </div>
            <div className="col-span-1 text-right tabular-nums">
              {r.own + r.trendyol}
              {r.own > 0 && r.trendyol > 0 && (
                <span className="block text-[10px] text-muted-foreground">
                  {r.own}+{r.trendyol}
                </span>
              )}
            </div>
            <div className="col-span-3 text-right tabular-nums text-muted-foreground">{formatCurrency(r.gross)}</div>
            <div className="col-span-3 text-right">
              <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {r.estimated && "~"}
                {formatCurrency(r.net)}
              </span>
              {cut > EPSILON && (
                <span className="block text-[10px] tabular-nums text-muted-foreground">
                  −{formatCurrency(cut)} kesinti
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div className={cn("grid grid-cols-12 gap-2 bg-muted/40 px-3 py-2.5 text-sm font-semibold")}>
        <span className="col-span-5">Toplam</span>
        <span className="col-span-1 text-right tabular-nums">{tot.qty}</span>
        <span className="col-span-3 text-right tabular-nums">{formatCurrency(tot.gross)}</span>
        <span className="col-span-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatCurrency(tot.net)}
        </span>
      </div>
      <p className="px-3 py-2.5 text-[11px] text-muted-foreground">
        Trendyol&apos;da eline geçen = komisyon ve senin karşıladığın indirim düşülmüş tutar, ürünlere fiyat payına göre
        dağıtıldı. <span className="font-medium">~</span> = henüz Trendyol ödeme kaydı yok, tahmini. Kendi siparişte
        kesinti yok.
      </p>
    </div>
  );
}
