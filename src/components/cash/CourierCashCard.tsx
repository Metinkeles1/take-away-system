"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, History, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  getCashHandovers,
  getCourierCash,
  handOverCourierCash,
  type CashHandoverRecord,
  type CourierCashRow,
  type CourierCashState,
} from "@/actions/courierCash";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { subscribeOrders } from "@/lib/pusher/client";
import { cn, formatCurrency } from "@/lib/utils";

const courierLabel = (c: string) => c || "Kurye belirtilmemiş";

function ageMin(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function formatAge(min: number): string {
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

const dateTimeOf = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });

// Uyarı yalnız NAKİT için: tutar eşiği ya da en eski nakitin bekleme süresi.
// Kapıda kart parası zaten bankaya geçer; kartta teslim = slip/POS raporu.
function cashAlert(row: CourierCashRow, alert: CourierCashState["alert"], now: number) {
  const cashOrders = row.orders.filter((o) => o.method === "cash");
  if (cashOrders.length === 0) return null;
  const oldest = ageMin(cashOrders[0].deliveredAt, now);
  if (row.cash >= alert.amount) return `Nakit ${formatCurrency(alert.amount)} sınırını geçti`;
  if (oldest >= alert.minutes) return `Nakit ${formatAge(oldest)}dır kuryede`;
  return null;
}

// Kuryelerdeki para — kapıda alınmış, kasaya henüz teslim edilmemiş nakit/kart.
// Komuta Merkezi ve Gün Sonu'nda kullanılır. Canlıdır (Pusher ile tazelenir).
export function CourierCashCard({ className }: { className?: string }) {
  const [state, setState] = useState<CourierCashState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [target, setTarget] = useState<CourierCashRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Hata sessiz: bir sonraki tazelemede yeniden denenir.
  const load = useCallback(() => {
    getCourierCash().then(setState, () => {});
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeOrders(load);
    // Pusher yoksa yedek + "kaç dk'dır bekliyor" sayacı dakikada bir ilerlesin.
    const t = setInterval(() => {
      setNow(Date.now());
      load();
    }, 60_000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [load]);

  const rows = state?.rows ?? [];
  const alertCount = state ? rows.filter((r) => cashAlert(r, state.alert, now)).length : 0;

  return (
    <Card className={cn("py-0 shadow-xs", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4 text-muted-foreground" />
            Kuryelerdeki para
            {alertCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="size-3" />
                {alertCount} uyarı
              </span>
            )}
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Kapıda alınan, kasaya henüz teslim edilmemiş ödemeler
          </p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setHistoryOpen(true)}>
          <History className="mr-1 size-4" />
          Geçmiş
        </Button>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {state === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            Tüm kapıda ödemeler kasaya teslim alındı.
          </div>
        ) : (
          <>
            <ul className="divide-y rounded-lg ring-1 ring-foreground/8">
              {rows.map((r) => {
                const warn = cashAlert(r, state.alert, now);
                return (
                  <li
                    key={r.courier || "_none"}
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5",
                      warn && "bg-rose-500/5",
                    )}
                  >
                    <div className="min-w-0 flex-1 basis-40">
                      <p className={cn("truncate text-sm font-semibold", !r.courier && "text-muted-foreground")}>
                        {courierLabel(r.courier)}
                      </p>
                      <p
                        className={cn(
                          "text-[11px] tabular-nums",
                          warn ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                        )}
                      >
                        {warn ?? `${r.orderCount} sipariş · en eski ${formatAge(ageMin(r.oldestAt, now))} önce`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 tabular-nums">
                      <div className="text-right">
                        <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <Banknote className="size-3" /> Nakit
                        </p>
                        <p className={cn("text-sm font-bold", warn && "text-rose-600 dark:text-rose-400")}>
                          {formatCurrency(r.cash)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <CreditCard className="size-3" /> Kart
                        </p>
                        <p className="text-sm font-semibold text-muted-foreground">{formatCurrency(r.card)}</p>
                      </div>
                      <Button size="sm" variant={warn ? "default" : "outline"} onClick={() => setTarget(r)}>
                        Teslim aldım
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {rows.length > 1 && (
              <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
                Toplam: nakit <b className="text-foreground">{formatCurrency(state.totalCash)}</b> · kart{" "}
                <b className="text-foreground">{formatCurrency(state.totalCard)}</b>
              </p>
            )}
          </>
        )}
      </CardContent>

      <HandoverDialog
        key={target ? target.courier || "_none" : "closed"}
        row={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          setTarget(null);
          load();
        }}
      />
      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </Card>
  );
}

// ─── Teslim al ────────────────────────────────────────────────────────────────
function HandoverDialog({
  row,
  onClose,
  onDone,
}: {
  row: CourierCashRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const countedNum = counted.trim() === "" ? null : Number(counted.replace(",", "."));
  const diff = row && countedNum != null && Number.isFinite(countedNum) ? countedNum - row.cash : null;

  const submit = async () => {
    if (!row) return;
    if (countedNum != null && (!Number.isFinite(countedNum) || countedNum < 0)) {
      toast.error("Sayılan tutar geçersiz");
      return;
    }
    setSaving(true);
    const res = await handOverCourierCash({
      courier: row.courier,
      refs: row.orders.map((o) => ({ source: o.source, ref: o.ref })),
      countedCash: countedNum,
      note,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Teslim kaydedilemedi");
      return;
    }
    const d = res.record?.cashDiff ?? 0;
    toast.success(
      d === 0
        ? `${courierLabel(row.courier)} — para teslim alındı`
        : `${courierLabel(row.courier)} — teslim alındı (${d < 0 ? "eksik" : "fazla"} ${formatCurrency(Math.abs(d))})`,
    );
    onDone();
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? courierLabel(row.courier) : ""} — teslim al</DialogTitle>
          <DialogDescription>
            Aşağıdaki siparişler kasaya teslim edildi olarak işaretlenecek.
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 tabular-nums">
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Beklenen nakit</p>
                <p className="text-lg font-bold">{formatCurrency(row.cash)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Kapıda kart (slip)</p>
                <p className="text-lg font-bold">{formatCurrency(row.card)}</p>
              </div>
            </div>

            <ul className="max-h-48 divide-y overflow-y-auto rounded-lg text-xs ring-1 ring-foreground/8">
              {row.orders.map((o) => (
                <li key={`${o.source}:${o.ref}`} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{timeOf(o.deliveredAt)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {o.source === "trendyol" && (
                      <span className="mr-1 font-semibold text-orange-600 dark:text-orange-400">TY</span>
                    )}
                    #{o.orderNumber} {o.customer && <span className="text-muted-foreground">· {o.customer}</span>}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{o.method === "cash" ? "Nakit" : "Kart"}</span>
                  <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{formatCurrency(o.amount)}</span>
                </li>
              ))}
            </ul>

            {row.cash > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="counted-cash">Sayılan nakit (isteğe bağlı)</Label>
                <Input
                  id="counted-cash"
                  inputMode="decimal"
                  placeholder={String(row.cash)}
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                />
                {diff != null && Math.abs(diff) >= 0.01 && (
                  <p
                    className={cn(
                      "text-xs font-medium",
                      diff < 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {diff < 0 ? "Eksik" : "Fazla"}: {formatCurrency(Math.abs(diff))}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="handover-note">Not (isteğe bağlı)</Label>
              <Input
                id="handover-note"
                placeholder="örn. 50 TL bozuk para eksik"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Vazgeç
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Teslim aldım"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Teslim geçmişi ───────────────────────────────────────────────────────────
function HistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [items, setItems] = useState<CashHandoverRecord[] | null>(null);

  useEffect(() => {
    if (!open) return;
    getCashHandovers(100).then(setItems, () => setItems([]));
  }, [open]);

  // Kurye bazında toplam fark — sürekli eksik çıkan kurye burada görünür.
  const diffs = new Map<string, number>();
  for (const h of items ?? []) {
    if (h.cashDiff) diffs.set(h.courier, (diffs.get(h.courier) ?? 0) + h.cashDiff);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Teslim geçmişi</DialogTitle>
          <DialogDescription>Son 100 teslim · kim, ne zaman, ne kadar</DialogDescription>
        </DialogHeader>

        {items === null ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Henüz teslim kaydı yok.</p>
        ) : (
          <>
            {diffs.size > 0 && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <p className="mb-1 font-medium">Toplam sayım farkı (bu listede)</p>
                {[...diffs.entries()].map(([c, d]) => (
                  <p key={c} className="flex justify-between tabular-nums">
                    <span>{c}</span>
                    <span className={d < 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}>
                      {d < 0 ? "eksik" : "fazla"} {formatCurrency(Math.abs(d))}
                    </span>
                  </p>
                ))}
              </div>
            )}
            <ul className="divide-y rounded-lg text-sm ring-1 ring-foreground/8">
              {items.map((h) => (
                <li key={h.id} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{h.courier}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{dateTimeOf(h.at)}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 text-xs tabular-nums text-muted-foreground">
                    <span>
                      {h.orderCount} sipariş · nakit {formatCurrency(h.expectedCash)} · kart {formatCurrency(h.expectedCard)}
                    </span>
                    {h.cashDiff !== 0 && (
                      <span
                        className={cn(
                          "font-semibold",
                          h.cashDiff < 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {h.cashDiff < 0 ? "eksik" : "fazla"} {formatCurrency(Math.abs(h.cashDiff))}
                      </span>
                    )}
                  </div>
                  {h.note && <p className="mt-0.5 text-xs italic text-muted-foreground">{h.note}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
