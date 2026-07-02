"use client";

import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface KomutaRankItem {
  id: string;
  label: string;
  primary: string; // sağdaki ana değer (örn. "38 adet" / "₺14.200")
  secondary?: string; // sağ alt ikincil (örn. "%39")
  ownShare: number; // 0–100 — mavi (kendi) segment genişliği (maksa göre)
  tyShare: number; // 0–100 — turuncu (Trendyol) segment genişliği (maksa göre)
}

interface Props {
  title: string;
  items: KomutaRankItem[];
  isLoading: boolean;
  emptyText: string;
  hint?: string;
  showLegend?: boolean;
  onItemClick?: (id: string) => void;
  /** Kartta gösterilecek en fazla satır. Aşılırsa "Tümünü Gör" çıkar. */
  maxItems?: number;
  /** "Tümünü Gör"e tıklanınca (modal açmak için). */
  onShowAll?: () => void;
  /** Kart çerçevesi olmadan (modal içi kullanım) sadece list gövdesi. */
  bare?: boolean;
}

function Legend() {
  return (
    <div className="flex shrink-0 gap-3 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-blue-500" /> Kendi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-orange-500" /> Trendyol
      </span>
    </div>
  );
}

// Sıralı liste gövdesi — her satırda iki renkli (mavi=kendi, turuncu=Trendyol)
// yığılmış çubuk. Satıra tıklanınca kanal kırılımı yan panel açılır.
function RankBody({
  items,
  isLoading,
  emptyText,
  onItemClick,
}: Pick<Props, "items" | "isLoading" | "emptyText" | "onItemClick">) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const body = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
                {it.label}
                {onItemClick && (
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
                )}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{it.primary}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-blue-500" style={{ width: `${it.ownShare}%` }} />
                <div className="h-full bg-orange-500" style={{ width: `${it.tyShare}%` }} />
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
  );
}

export function KomutaRankList({
  title,
  items,
  isLoading,
  emptyText,
  hint,
  showLegend,
  onItemClick,
  maxItems,
  onShowAll,
  bare,
}: Props) {
  // Modal içi: çerçevesiz, tüm satırlar.
  if (bare) {
    return (
      <div>
        {showLegend && !isLoading && items.length > 0 && (
          <div className="mb-3 flex justify-end">
            <Legend />
          </div>
        )}
        <RankBody
          items={items}
          isLoading={isLoading}
          emptyText={emptyText}
          onItemClick={onItemClick}
        />
      </div>
    );
  }

  const limited = maxItems != null ? items.slice(0, maxItems) : items;
  const hasMore = maxItems != null && items.length > maxItems;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {showLegend && !isLoading && items.length > 0 && <Legend />}
        </div>
        {hint && !isLoading && items.length > 0 && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </CardHeader>
      <CardContent>
        <RankBody
          items={limited}
          isLoading={isLoading}
          emptyText={emptyText}
          onItemClick={onItemClick}
        />
        {hasMore && onShowAll && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onShowAll}
            className="mt-2 w-full text-muted-foreground"
          >
            Tümünü Gör ({items.length})
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
