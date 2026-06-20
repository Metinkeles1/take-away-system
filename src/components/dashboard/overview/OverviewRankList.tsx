"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface RankItem {
  id: string;
  label: string;
  primary: string; // sağdaki ana değer (örn. ₺ tutar)
  secondary?: string; // altındaki ikincil bilgi
  share: number; // 0–100 oransal bar
  color?: string; // bar rengi (tailwind class)
}

interface Props {
  title: string;
  items: RankItem[];
  isLoading: boolean;
  emptyText: string;
  /** Verilirse satırlar tıklanabilir olur (detay modalı açar). */
  onItemClick?: (id: string) => void;
  /** Tıklanabilir liste için başlık altı ipucu. */
  hint?: string;
}

// Tek tip "sıralı + paylı" liste — ürün, kanal, ödeme hepsi bunu kullanır.
// Tutarlı görünüm = daha az kafa karışıklığı.
export function OverviewRankList({
  title,
  items,
  isLoading,
  emptyText,
  onItemClick,
  hint,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {hint && !isLoading && items.length > 0 && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((it) => {
              const body = (
                <>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{it.label}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {it.primary}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", it.color ?? "bg-primary")}
                        style={{ width: `${Math.max(it.share, 2)}%` }}
                      />
                    </div>
                    {it.secondary && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {it.secondary}
                      </span>
                    )}
                  </div>
                </>
              );
              return (
                <li key={it.id}>
                  {onItemClick ? (
                    <button
                      type="button"
                      onClick={() => onItemClick(it.id)}
                      className="-mx-2 block w-[calc(100%+1rem)] cursor-pointer rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="py-1.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
