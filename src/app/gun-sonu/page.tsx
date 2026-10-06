"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, History, Lock, LockKeyhole, Printer, RefreshCw, Share2 } from "lucide-react";

import {
  getEndOfDay,
  getEndOfDayOrders,
  listEndOfDaySnapshots,
  saveEndOfDaySnapshot,
  type EndOfDayComparison,
  type EndOfDayOrder,
  type EndOfDayReport,
  type EndOfDaySnapshotSummary,
} from "@/actions/endOfDay";
import { getCourierCash } from "@/actions/courierCash";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import EndOfDayReceipt from "@/components/receipt/EndOfDayReceipt";
import { Ledger } from "@/components/gun-sonu/Ledger";
import { OrdersPanel, type PanelView } from "@/components/gun-sonu/OrdersPanel";
import { ArchiveList } from "@/components/gun-sonu/ArchiveList";
import { CloseDialog, EMPTY_COUNT, countedValues, type CashCountState } from "@/components/gun-sonu/CloseDialog";
import {
  EPSILON,
  formatDayTR,
  istanbulToday,
  ownNet,
  scopeFromKey,
  shiftDay,
  trendyolNet,
  type OrderFilter,
} from "@/components/gun-sonu/meta";
import { cn, formatCurrency } from "@/lib/utils";

// Gün özetini paylaşılabilir düz metne dök (WhatsApp/pano).
function buildShareText(r: EndOfDayReport): string {
  const ty = trendyolNet(r.trendyol);
  const tyShow = ty.available && (r.trendyol?.orderCount ?? 0) > 0;
  const own = ownNet(r);
  const grand = ty.total + own.net;
  const lines: string[] = [
    `📊 Gün Sonu · ${formatDayTR(r.date)}`,
    "",
    `Sipariş: ${r.packageCount} · Brüt: ${formatCurrency(r.totalRevenue)}`,
  ];
  if (r.cancelledCount > 0) lines.push(`İptal: ${r.cancelledCount}`);
  lines.push("");
  if (tyShow) lines.push(`🛵 Trendyol net: ${formatCurrency(ty.total)}`);
  if (own.net > EPSILON) lines.push(`💵 Kendi ödemeler (net): ${formatCurrency(own.net)}`);
  if (own.mealCut > EPSILON) lines.push(`   ↳ yemek kartı kesintisi: −${formatCurrency(own.mealCut)}`);
  lines.push(`✅ Net toplam: ${formatCurrency(grand)}`);
  if (r.corporateTotal > EPSILON) lines.push(`🏢 Kurumsal (açık hesap, nete dahil değil): ${formatCurrency(r.corporateTotal)}`);
  if (r.openAmount > EPSILON) lines.push(`⚠️ Açık hesap: ${formatCurrency(r.openAmount)} (${r.openCount} sipariş)`);
  return lines.join("\n");
}

// Seçili gün + filtre + görünüm adres çubuğunda tutulur (?gun=…&kapsam=…). Sipariş
// sayfasına gidip geri gelince (tarayıcı geri) aynı yerden devam edilir.
const STATES = ["open", "late", "cancelled"] as const;
interface UrlState {
  date: string;
  filter: OrderFilter;
  view: PanelView;
}

function readUrl(today: string): UrlState {
  const q = new URLSearchParams(window.location.search);
  const g = q.get("gun");
  const durum = q.get("durum");
  const kapsam = q.get("kapsam");
  return {
    date: g && /^\d{4}-\d{2}-\d{2}$/.test(g) && g <= today ? g : today,
    filter: {
      scope: kapsam ? scopeFromKey(kapsam) : undefined,
      courier: q.get("kurye") ?? undefined,
      state: STATES.find((x) => x === durum),
      q: q.get("ara") ?? undefined,
    },
    view: q.get("gorunum") === "urunler" ? "products" : "orders",
  };
}

function writeUrl({ date, filter, view }: UrlState, today: string) {
  const q = new URLSearchParams();
  if (date !== today) q.set("gun", date);
  if (filter.scope) q.set("kapsam", filter.scope.key);
  if (filter.courier) q.set("kurye", filter.courier);
  if (filter.state) q.set("durum", filter.state);
  if (filter.q) q.set("ara", filter.q);
  if (view === "products") q.set("gorunum", "urunler");
  const qs = q.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", url);
}

// Gün Sonu — kapanış ekranı. Solda Para Defteri (eline ne geçti, nereden), sağda
// günün siparişleri (deftere tıklayınca süzülür). Analiz/trend Komuta'da; burası
// "günü say, kontrol et, kapat" içindir. Masaüstünde tek ekran, paneller kendi
// içinde kayar.
export default function EndOfDayPage() {
  const today = useMemo(() => istanbulToday(), []);
  // null = adres çubuğu henüz okunmadı (sunucu çiziminde window yok).
  const [date, setDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderFilter>({});
  const [view, setView] = useState<PanelView>("orders");

  const [report, setReport] = useState<EndOfDayReport | null>(null);
  const [comparison, setComparison] = useState<EndOfDayComparison | null>(null);
  const [closed, setClosed] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<EndOfDayOrder[]>([]);
  const [targetMin, setTargetMin] = useState(35);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [courierPending, setCourierPending] = useState<number | null>(null);
  const [count, setCount] = useState<CashCountState>(EMPTY_COUNT);
  const [closeOpen, setCloseOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<EndOfDaySnapshotSummary[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Hızlı gün değiştirmede eski cevap yenisini ezmesin.
  const reqId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      setSnapshots(await listEndOfDaySnapshots());
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  // İlk açılış: gün/filtre/görünüm adres çubuğundan.
  useEffect(() => {
    const u = readUrl(today);
    setFilter(u.filter);
    setView(u.view);
    setDate(u.date);
  }, [today]);
  useEffect(() => {
    if (date) writeUrl({ date, filter, view }, today);
  }, [date, filter, view, today]);

  // Rapor (para, snapshot) ve sipariş listesi paralel; liste raporu bekletmez.
  const load = useCallback(async () => {
    if (!date) return;
    const id = ++reqId.current;
    const isCurrent = () => id === reqId.current;
    setIsLoading(true);
    setOrdersLoading(true);
    getEndOfDayOrders(date)
      .then((d) => {
        if (!isCurrent()) return;
        setOrders(d.orders);
        setTargetMin(d.deliveryTargetMin);
      })
      .catch(() => isCurrent() && setOrders([]))
      .finally(() => isCurrent() && setOrdersLoading(false));
    // Kuryelerdeki para yalnız bugün anlamlı (canlı durum).
    setCourierPending(null);
    if (date === today)
      getCourierCash()
        .then((c) => isCurrent() && setCourierPending(c.totalCash + c.totalCard))
        .catch(() => {});
    try {
      const data = await getEndOfDay(date);
      if (!isCurrent()) return;
      setReport(data.report);
      setClosed(data.closed);
      setClosedAt(data.closedAt);
      setComparison(data.comparison);
      // Kayıtlı sayım varsa doldur + aç; yoksa boşalt (önceki günün rakamı kalmasın).
      const s = (v: number | null) => (v != null ? String(v) : "");
      setCount({
        show: [data.cashCounted, data.cardCounted, data.ibanCounted, data.ticketCounted].some((v) => v != null),
        cash: s(data.cashCounted),
        card: s(data.cardCounted),
        iban: s(data.ibanCounted),
        ticket: s(data.ticketCounted),
      });
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [date, today]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadArchive();
  }, [loadArchive]);
  useEffect(() => {
    document.title = "Gün Sonu · Paket Sipariş";
  }, []);

  const changeDate = useCallback(
    (d: string) => {
      setDate(d > today ? today : d);
      setFilter({});
    },
    [today],
  );

  const confirmClose = useCallback(
    async (print: boolean) => {
      if (
        courierPending != null &&
        courierPending > EPSILON &&
        !window.confirm(`Kuryelerde teslim alınmamış ${formatCurrency(courierPending)} var. Yine de gün kapatılsın mı?`)
      )
        return;
      setIsClosing(true);
      try {
        if (!date) return;
        await saveEndOfDaySnapshot(date, "manual", countedValues(count));
        setCloseOpen(false);
        await Promise.all([load(), loadArchive()]);
        // Dialog kapanıp güncel fiş çizilsin, sonra yazdır.
        if (print) later(() => window.print(), 300);
      } finally {
        setIsClosing(false);
      }
    },
    [courierPending, date, count, load, loadArchive, later],
  );

  const handleShare = useCallback(async () => {
    if (!report) return;
    const data = { text: buildShareText(report) };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
      } catch {
        // kullanıcı iptal etti
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(data.text);
      setCopied(true);
      later(() => setCopied(false), 2000);
    } catch {
      // pano da yoksa sessizce geç
    }
  }, [report, later]);

  const empty = !report || report.packageCount === 0;
  const counted = countedValues(count);

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:overflow-hidden">
      {/* Başlık + gün seçici + eylemler */}
      <header className="flex shrink-0 flex-col gap-3 px-4 pt-4 pb-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8 lg:pt-6">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Gün Sonu
            {closed && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                title={closedAt ? `Donduruldu: ${new Date(closedAt).toLocaleString("tr-TR")}` : undefined}
              >
                <Lock className="size-3" />
                Kapatıldı
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{date ? formatDayTR(date) : "\u00a0"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border shadow-xs">
            <button
              type="button"
              aria-label="Önceki gün"
              onClick={() => date && changeDate(shiftDay(date, -1))}
              className="flex h-8 w-8 items-center justify-center hover:bg-muted"
            >
              <ChevronLeft className="size-4" />
            </button>
            <input
              type="date"
              value={date ?? ""}
              max={today}
              onChange={(e) => e.target.value && changeDate(e.target.value)}
              className="h-8 border-x bg-background px-2 text-sm outline-none"
            />
            <button
              type="button"
              aria-label="Sonraki gün"
              disabled={!date || date >= today}
              onClick={() => date && changeDate(shiftDay(date, 1))}
              className="flex h-8 w-8 items-center justify-center hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          {date && date !== today && (
            <Button variant="ghost" size="sm" onClick={() => changeDate(today)}>
              Bugün
            </Button>
          )}
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" onClick={load} disabled={isLoading} aria-label="Yenile" title="Yenile">
              <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setHistoryOpen(true)}
              aria-label="Kapatılan günler"
              title="Kapatılan günler"
            >
              <History className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleShare}
              disabled={isLoading || empty}
              aria-label="Paylaş"
              title={copied ? "Kopyalandı" : "Paylaş"}
            >
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Share2 className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => window.print()}
              disabled={isLoading || empty}
              aria-label="Fiş yazdır"
              title="Fiş yazdır"
            >
              <Printer className="size-3.5" />
            </Button>
          </div>
          <Button size="sm" onClick={() => setCloseOpen(true)} disabled={isLoading || empty} className="gap-1.5">
            <LockKeyhole className="size-3.5" />
            {closed ? "Yeniden Kapat" : "Günü Kapat"}
          </Button>
        </div>
      </header>

      {/* İki panel — masaüstünde ekranı doldurur, her biri kendi içinde kayar */}
      <main className="flex flex-1 flex-col gap-4 px-4 pb-4 sm:px-6 lg:min-h-0 lg:flex-row lg:px-8 lg:pb-6">
        <section className="rounded-xl border bg-card shadow-xs lg:min-h-0 lg:w-100 lg:shrink-0 lg:overflow-y-auto">
          <Ledger
            report={report}
            orders={orders}
            comparison={comparison}
            targetMin={targetMin}
            courierPending={courierPending}
            isLoading={isLoading}
            filter={filter}
            onFilter={setFilter}
          />
        </section>
        <section className="flex min-h-120 flex-col overflow-hidden rounded-xl border bg-card shadow-xs lg:min-h-0 lg:min-w-0 lg:flex-1">
          <OrdersPanel
            orders={orders}
            isLoading={ordersLoading}
            targetMin={targetMin}
            filter={filter}
            onFilterChange={setFilter}
            view={view}
            onViewChange={setView}
          />
        </section>
      </main>

      {/* Baskı fişi — ekranda görünmez, yalnız yazdırırken basılır */}
      {report && (
        <div aria-hidden className="pointer-events-none fixed top-0 left-0 -z-10 opacity-0 print:opacity-100">
          <EndOfDayReceipt
            report={report}
            cashCounted={counted.cash}
            cardCounted={counted.card}
            ibanCounted={counted.iban}
            ticketCounted={counted.ticket}
          />
        </div>
      )}

      {report && (
        <CloseDialog
          open={closeOpen}
          onOpenChange={setCloseOpen}
          report={report}
          closed={closed}
          busy={isClosing}
          count={count}
          onCountChange={setCount}
          onConfirm={confirmClose}
        />
      )}

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b p-4">
            <SheetTitle>Kapatılan Günler</SheetTitle>
            <SheetDescription>Bir güne tıkla, o günün dökümü açılsın.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-3">
            <ArchiveList
              snapshots={snapshots}
              activeDate={date ?? ""}
              isLoading={archiveLoading}
              onSelect={(d) => {
                changeDate(d);
                setHistoryOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
