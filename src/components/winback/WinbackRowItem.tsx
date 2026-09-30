"use client";

import { memo, useState } from "react";
import {
  MessageCircle,
  Phone,
  MoreHorizontal,
  Clock,
  Ban,
  History,
  Undo2,
  Heart,
  CheckCircle2,
  PhoneOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatCurrency, formatPhone, phoneKey } from "@/lib/utils";
import { winbackValue, type WinbackMethod, type WinbackRow } from "@/lib/winback";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (d <= 0) return "bugün";
  if (d === 1) return "dün";
  return `${d} gün önce`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

const SEGMENT_DOT: Record<NonNullable<WinbackRow["segment"]>, string> = {
  at_risk: "bg-amber-500",
  lapsed: "bg-rose-500",
  occasional: "bg-slate-400",
};

export type WinbackRowAction =
  | { type: "contact"; method: WinbackMethod }
  | { type: "snooze"; days: number }
  | { type: "optOut" }
  | { type: "restore" }
  | { type: "history" };

// Tek müşteri satırı. Sekmeye göre alt satır ve düğmeler değişir:
// listeler → ulaş; Ulaşıldı → bekleniyor; Geri döndü → sonuç; Hariç → geri al.
export const WinbackRowItem = memo(function WinbackRowItem({
  row,
  onAction,
}: {
  row: WinbackRow;
  onAction: (row: WinbackRow, action: WinbackRowAction) => void;
}) {
  const phone = formatPhone(phoneKey(row.phone));
  const lc = row.lastContact;
  const isList = row.status === "at_risk" || row.status === "lapsed" || row.status === "occasional";
  const value = winbackValue(row);
  const [menuOpen, setMenuOpen] = useState(false);
  const act = (action: WinbackRowAction) => {
    setMenuOpen(false);
    onAction(row, action);
  };

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {row.segment && (
            <span className={cn("size-2 shrink-0 rounded-full", SEGMENT_DOT[row.segment])} />
          )}
          <span className="truncate font-semibold">{row.name ?? phone}</span>
          {row.name && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{phone}</span>
          )}
        </div>
        {row.address && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.address}</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            <b className="font-semibold text-foreground">{row.orders}</b> sipariş
          </span>
          <span>
            ort. <b className="font-semibold text-foreground">{formatCurrency(row.avgBasket)}</b>
          </span>
          <span
            className={cn(
              row.status === "lapsed" && "font-medium text-rose-600 dark:text-rose-400",
              row.status === "at_risk" && "font-medium text-amber-600 dark:text-amber-400",
            )}
          >
            son sipariş {row.daysSince} gün önce
          </span>
          {row.usualGapDays !== null && <span>genelde {row.usualGapDays} günde bir</span>}
          {row.favorites[0] && (
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3 text-rose-400" />
              {row.favorites.join(", ")}
            </span>
          )}
        </div>

        {/* Durum satırı — bu müşteriyle en son ne yapıldı */}
        {row.status === "returned" && row.returned && lc ? (
          <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="size-3.5" />
            {shortDate(lc.at)} {lc.method === "whatsapp" ? "mesaj atıldı" : "arandı"} →{" "}
            {row.returned.daysAfterContact === 0 ? "aynı gün" : `${row.returned.daysAfterContact} gün sonra`}{" "}
            döndü · <b>{row.returned.orders} sipariş · {formatCurrency(row.returned.revenue)}</b>
          </p>
        ) : row.status === "excluded" && row.excluded ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {row.excluded.optOut ? <Ban className="size-3.5" /> : <Clock className="size-3.5" />}
            {row.excluded.optOut
              ? "Mesaj istemiyor — listelenmiyor"
              : `${shortDate(row.excluded.snoozeUntil!)} tarihine kadar ertelendi`}
          </p>
        ) : lc ? (
          <p
            className={cn(
              "mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-md px-2 py-1 text-xs",
              row.status === "contacted"
                ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                : "bg-muted text-muted-foreground",
            )}
          >
            {lc.result === "no_answer" ? (
              <PhoneOff className="size-3.5" />
            ) : lc.method === "whatsapp" ? (
              <MessageCircle className="size-3.5" />
            ) : (
              <Phone className="size-3.5" />
            )}
            {lc.method === "whatsapp"
              ? `${daysAgo(lc.at)} WhatsApp${lc.templateTitle ? ` · “${lc.templateTitle}”` : ""}`
              : lc.result === "no_answer"
                ? `${daysAgo(lc.at)} arandı, açmadı`
                : `${daysAgo(lc.at)} arandı`}
            {lc.note && <span className="italic">· {lc.note}</span>}
            {row.status === "contacted" && <span className="font-medium">· dönüşü bekleniyor</span>}
            {isList && row.contactCount > 1 && <span>· toplam {row.contactCount} deneme</span>}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5">
        <div className="mr-auto text-left sm:mr-0 sm:text-right">
          <div className="text-sm font-bold tabular-nums">{formatCurrency(value.amount)}</div>
          <div className="text-xs text-muted-foreground">
            {value.label}
            {row.segment !== "occasional" && ` · top. ${formatCurrency(row.total)}`}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {row.status === "excluded" ? (
            <Button size="sm" variant="outline" onClick={() => onAction(row, { type: "restore" })}>
              <Undo2 />
              Listeye geri al
            </Button>
          ) : row.status !== "returned" ? (
            <>
              <Button
                size="sm"
                onClick={() => onAction(row, { type: "contact", method: "whatsapp" })}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <MessageCircle />
                {row.status === "contacted" ? "Tekrar yaz" : "WhatsApp"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction(row, { type: "contact", method: "call" })}
              >
                <Phone />
                Ara
              </Button>
            </>
          ) : null}

          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Diğer işlemler">
                <MoreHorizontal />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 gap-0.5 p-1.5">
              <MenuItem icon={History} onClick={() => act({ type: "history" })}>
                Sipariş geçmişi
              </MenuItem>
              {row.status !== "excluded" && row.status !== "returned" && (
                <>
                  <MenuItem icon={Clock} onClick={() => act({ type: "snooze", days: 7 })}>
                    1 hafta ertele
                  </MenuItem>
                  <MenuItem icon={Clock} onClick={() => act({ type: "snooze", days: 30 })}>
                    1 ay ertele
                  </MenuItem>
                  <MenuItem
                    icon={Ban}
                    onClick={() => act({ type: "optOut" })}
                    className="text-rose-600 dark:text-rose-400"
                  >
                    Mesaj istemiyor
                  </MenuItem>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
});

function MenuItem({
  icon: Icon,
  children,
  onClick,
  className,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
        className,
      )}
    >
      <Icon className="size-4 shrink-0 opacity-70" />
      {children}
    </button>
  );
}
