"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Search, Settings2, HeartHandshake, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented, StatStrip, StripStat } from "@/components/dashboard/komuta/KomutaUI";
import { CustomerHistoryDialog } from "@/components/customers/CustomerHistoryDialog";
import { WinbackRowItem, type WinbackRowAction } from "@/components/winback/WinbackRowItem";
import { WinbackContactDialog } from "@/components/winback/WinbackContactDialog";
import { WinbackSettingsDialog } from "@/components/winback/WinbackSettingsDialog";
import {
  getWinbackBoard,
  restoreWinback,
  setWinbackOptOut,
  snoozeWinback,
} from "@/actions/winback";
import {
  winbackValue,
  type WinbackBoard,
  type WinbackMethod,
  type WinbackRow,
  type WinbackStatus,
} from "@/lib/winback";
import { cn, formatCurrency, formatCurrencyShort, phoneKey } from "@/lib/utils";

type SortKey = "value" | "days";

// "Geri al" bildirimi — varsayılan 4 sn yanlış tıklamayı fark etmeye yetmiyor.
const UNDO_TOAST_MS = 10_000;

const TABS: {
  id: WinbackStatus;
  label: string;
  dot?: string;
  help: (s: WinbackBoard["settings"]) => string;
}[] = [
  {
    id: "lapsed",
    label: "Kaybolan",
    dot: "bg-rose-500",
    help: (s) =>
      `En az ${s.minOrders} sipariş vermiş, ${s.lapsedDays} gündür sipariş vermeyen müşteriler. En değerli liste — önce bunlara ulaşın.`,
  },
  {
    id: "at_risk",
    label: "Risk altında",
    dot: "bg-amber-500",
    help: () =>
      "Henüz kaybolmadı ama her zamankinin iki katı süredir sipariş yok. Şimdi küçük bir hatırlatma, kaybetmeden önce yakalar.",
  },
  {
    id: "occasional",
    label: "Az gelen",
    dot: "bg-slate-400",
    help: (s) =>
      `Bir-iki kez sipariş verip ${s.lapsedDays} gündür gelmeyenler. Tekrar denemeleri için bir teklif iyi gelir.`,
  },
  {
    id: "contacted",
    label: "Ulaşıldı",
    dot: "bg-blue-500",
    help: (s) =>
      `Mesaj atılan / aranan müşteriler. ${s.waitDays} gün içinde sipariş verirlerse otomatik olarak "Geri döndü"ye geçer.`,
  },
  {
    id: "returned",
    label: "Geri döndü",
    dot: "bg-emerald-500",
    help: () => "Ulaştıktan sonra sipariş veren müşteriler — kazanılanlar ve getirdikleri ciro.",
  },
  {
    id: "excluded",
    label: "Hariç",
    help: () => "Ertelenen veya mesaj istemeyen müşteriler. Listelerde görünmezler.",
  },
];

export default function WinbackPage() {
  const [board, setBoard] = useState<WinbackBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WinbackStatus>("lapsed");
  const [sort, setSort] = useState<SortKey>("value");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const [contact, setContact] = useState<{ row: WinbackRow; method: WinbackMethod } | null>(null);
  const [historyRow, setHistoryRow] = useState<WinbackRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBoard(await getWinbackBoard());
    } catch {
      toast.error("Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = {} as Record<WinbackStatus, number>;
    for (const t of TABS) c[t.id] = 0;
    for (const r of board?.rows ?? []) c[r.status]++;
    return c;
  }, [board]);

  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLocaleLowerCase("tr-TR");
    const qDigits = phoneKey(q);
    const list = (board?.rows ?? []).filter((r) => {
      if (r.status !== tab) return false;
      if (!q) return true;
      return (
        (qDigits.length >= 3 && r.key.includes(qDigits)) ||
        r.name?.toLocaleLowerCase("tr-TR").includes(q) ||
        r.address?.toLocaleLowerCase("tr-TR").includes(q)
      );
    });
    if (tab === "contacted" || tab === "returned") {
      // Takip sekmeleri: en yeni ulaşma üstte.
      return list.sort(
        (a, b) => new Date(b.lastContact?.at ?? 0).getTime() - new Date(a.lastContact?.at ?? 0).getTime(),
      );
    }
    return list.sort((a, b) =>
      sort === "value"
        ? winbackValue(b).amount - winbackValue(a).amount
        : a.daysSince - b.daysSince,
    );
  }, [board, tab, sort, deferredQuery]);

  const handleAction = useCallback(
    async (row: WinbackRow, action: WinbackRowAction) => {
      switch (action.type) {
        case "contact":
          setContact({ row, method: action.method });
          return;
        case "history":
          setHistoryRow(row);
          return;
        case "snooze":
          await snoozeWinback(row.phone, action.days);
          toast.success(action.days === 7 ? "1 hafta ertelendi" : "1 ay ertelendi", {
            action: { label: "Geri al", onClick: () => void restoreWinback(row.phone).then(load) },
            duration: UNDO_TOAST_MS,
          });
          break;
        case "optOut":
          await setWinbackOptOut(row.phone, true);
          toast.success("Hariç tutuldu — bir daha listelenmeyecek", {
            action: { label: "Geri al", onClick: () => void restoreWinback(row.phone).then(load) },
            duration: UNDO_TOAST_MS,
          });
          break;
        case "restore":
          await restoreWinback(row.phone);
          toast.success("Listeye geri alındı");
          break;
      }
      void load();
    },
    [load],
  );

  const stats = board?.stats;
  const settings = board?.settings;
  const activeTab = TABS.find((t) => t.id === tab)!;
  const returnRate =
    stats && stats.contacted30 - stats.waiting30 > 0
      ? Math.round((stats.returned30 / (stats.contacted30 - stats.waiting30)) * 100)
      : null;

  return (
    <main className="h-full overflow-y-auto px-4 pt-4 pb-8 md:px-6 md:pt-5 lg:px-8 lg:pt-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="hidden size-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 sm:flex dark:bg-rose-950/60 dark:text-rose-300">
              <HeartHandshake className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Geri Kazan</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Bir süredir sipariş vermeyen müşterilere ulaşın, dönenleri takip edin.
              </p>
              {stats && (
                <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                  Bugün {stats.contactedToday} kişiye ulaşıldı
                  {stats.contactedToday === 0 && " — listenin en üstünden başlayın"}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={load} disabled={loading} aria-label="Yenile">
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)} disabled={!settings}>
              <Settings2 />
              <span className="hidden sm:inline">Ayarlar</span>
            </Button>
          </div>
        </header>

        <StatStrip className="grid-cols-2 lg:grid-cols-4">
          <StripStat
            label="Kaybolan sadık müşteri"
            dot="bg-rose-500"
            value={stats ? String(stats.lapsed) : "–"}
            sub={stats ? `ayda ~${formatCurrencyShort(stats.lapsedMonthlyValue)} ciro bırakıyorlardı` : undefined}
            tone="bad"
            isLoading={!board}
          />
          <StripStat
            label="Risk altında"
            dot="bg-amber-500"
            value={stats ? String(stats.atRisk) : "–"}
            sub="alışkanlığının 2 katı süredir yok"
            tone="warn"
            isLoading={!board}
          />
          <StripStat
            label="Son 30 günde ulaşılan"
            dot="bg-blue-500"
            value={stats ? String(stats.contacted30) : "–"}
            sub={stats ? `${stats.waiting30} kişinin dönüşü bekleniyor` : undefined}
            isLoading={!board}
          />
          <StripStat
            label="Geri dönen (30 gün)"
            dot="bg-emerald-500"
            value={
              stats ? `${stats.returned30}${returnRate !== null ? ` · %${returnRate}` : ""}` : "–"
            }
            sub={stats ? `${formatCurrency(stats.returnedRevenue30)} ciro getirdi` : undefined}
            tone="good"
            isLoading={!board}
          />
        </StatStrip>

        <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide md:mx-0 md:px-0">
          <Segmented
            ariaLabel="Liste"
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({
              id: t.id,
              dot: t.dot,
              label: board ? `${t.label} ${counts[t.id]}` : t.label,
            }))}
            className="h-9"
          />
        </div>

        {settings && <p className="-mt-1 text-sm text-muted-foreground">{activeTab.help(settings)}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İsim, telefon veya adres ara…"
              className="pl-9"
            />
          </div>
          {tab !== "contacted" && tab !== "returned" && (
            <Segmented
              ariaLabel="Sıralama"
              value={sort}
              onChange={setSort}
              options={[
                { id: "value", label: "En değerli" },
                { id: "days", label: "Yeni kaybolan" },
              ]}
              className="h-9 self-start sm:self-auto"
            />
          )}
        </div>

        <Card className="gap-0 overflow-hidden py-0">
          {!board ? (
            <div className="divide-y">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex flex-col gap-2 px-4 py-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-sm text-muted-foreground">
              <PartyPopper className="size-8 opacity-40" />
              {query ? "Aramaya uyan müşteri yok." : "Bu listede şu an kimse yok."}
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <WinbackRowItem key={r.key} row={r} onAction={handleAction} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <WinbackContactDialog
        row={contact?.row ?? null}
        initialMethod={contact?.method ?? "whatsapp"}
        templates={settings?.templates ?? []}
        onClose={() => setContact(null)}
        onSaved={load}
      />
      <CustomerHistoryDialog
        customer={historyRow ? { name: historyRow.name ?? historyRow.phone, phone: historyRow.phone, orderCount: historyRow.orders } : null}
        onClose={() => setHistoryRow(null)}
      />
      {settings && (
        <WinbackSettingsDialog
          open={settingsOpen}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={load}
        />
      )}
    </main>
  );
}
