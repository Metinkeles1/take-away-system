"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Printer,
  RefreshCw,
  Package,
  Wallet,
  Receipt,
  Ban,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { getEndOfDayReport, type EndOfDayReport } from "@/actions/endOfDay";
import EndOfDayReceipt from "@/components/receipt/EndOfDayReceipt";
import { formatCurrency, cn } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Nakit",
  card: "Kredi/Banka Kartı",
  online: "Online Ödeme",
  meal_card: "Yemek Kartı",
  iban: "IBAN / Havale",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Telefon / Manuel",
  trendyol: "Trendyol",
  getir: "Getir",
  yemeksepeti: "Yemeksepeti",
};

const SOURCE_DOT: Record<string, string> = {
  manual: "bg-slate-400",
  trendyol: "bg-orange-500",
  getir: "bg-purple-500",
  yemeksepeti: "bg-pink-500",
};

// Istanbul "bugün" tarihini YYYY-MM-DD olarak verir (date input default'u).
function istanbulToday(): string {
  const ist = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = `${ist.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${ist.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const StatCard = memo(function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", accent)}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
          {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
});

const BreakdownTable = memo(function BreakdownTable({
  title,
  rows,
  labels,
  countHeader,
  total,
  dots,
}: {
  title: string;
  rows: { key: string; count: number; amount: number }[];
  labels: Record<string, string>;
  countHeader: string;
  total: number;
  dots?: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Bu gün için kayıt yok
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-foreground/8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Kalem</th>
                  <th className="px-3 py-2 text-center font-medium">{countHeader}</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {dots && (
                          <span
                            className={cn("size-2 shrink-0 rounded-full", dots[r.key] ?? "bg-slate-400")}
                          />
                        )}
                        {labels[r.key] ?? r.key}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.count}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                      {total > 0 ? `%${Math.round((r.amount / total) * 100)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-3 py-2">Toplam</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {rows.reduce((s, r) => s + r.count, 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(total)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

const CorporateTable = memo(function CorporateTable({
  rows,
  total,
  open,
}: {
  rows: { id: string; name: string; count: number; amount: number; openAmount: number }[];
  total: number;
  open: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-cyan-500" />
          Kurumsal Hesaplar (O Gün Giden)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Bu gün kurumsal fiş kesilmemiş
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-foreground/8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Firma</th>
                  <th className="px-3 py-2 text-center font-medium">Fiş</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  <th className="px-3 py-2 text-right font-medium">Açık</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        href={`/corporate/${r.id}`}
                        className="font-medium text-cyan-600 hover:underline dark:text-cyan-400"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.count}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.openAmount > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {formatCurrency(r.openAmount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-3 py-2">Toplam</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {rows.reduce((s, r) => s + r.count, 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {open > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        {formatCurrency(open)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default function EndOfDayPage() {
  const [date, setDate] = useState(istanbulToday);
  const [report, setReport] = useState<EndOfDayReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getEndOfDayReport(date);
      setReport(data);
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.title = "Gün Sonu Raporu · Paket Sipariş";
  }, []);

  // Mount başına bir kez — her render'da yeniden hesaplama yok.
  const today = useMemo(() => istanbulToday(), []);
  const paymentTotal = useMemo(
    () => report?.paymentBreakdown.reduce((s, r) => s + r.amount, 0) ?? 0,
    [report],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Gün Sonu Raporu
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seçilen güne ait ödeme ve kanal kırılımı — fiş olarak yazdırılabilir
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={isLoading}
              className="gap-1.5"
            >
              <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Yenile</span>
            </Button>
            <Button
              size="sm"
              onClick={() => window.print()}
              disabled={isLoading || !report || report.packageCount === 0}
              className="gap-1.5"
            >
              <Printer className="size-3.5" />
              Fiş Yazdır
            </Button>
          </div>
        </header>

        {/* KPI kartları */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {isLoading || !report ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))
          ) : (
            <>
              <StatCard
                icon={Package}
                label="Toplam Paket"
                value={`${report.packageCount}`}
                sub={`Ort. sepet ${formatCurrency(report.avgBasket)}`}
                accent="bg-blue-500/15 text-blue-600 dark:text-blue-400"
              />
              <StatCard
                icon={Wallet}
                label="Toplam Ciro"
                value={formatCurrency(report.totalRevenue)}
                accent="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                icon={Receipt}
                label="Açık Hesap"
                value={formatCurrency(report.openAmount)}
                sub={`${report.openCount} sipariş · Tahsil ${formatCurrency(report.paidAmount)}`}
                accent="bg-amber-500/15 text-amber-600 dark:text-amber-400"
              />
              <StatCard
                icon={Building2}
                label="Kurumsal (Bugün)"
                value={formatCurrency(report.corporateTotal)}
                sub={`${report.corporateVoucherCount} fiş · Açık ${formatCurrency(report.corporateOpen)}`}
                accent="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
              />
              <StatCard
                icon={Ban}
                label="İptal Edilen"
                value={`${report.cancelledCount}`}
                accent="bg-rose-500/15 text-rose-600 dark:text-rose-400"
              />
            </>
          )}
        </section>

        {/* Kırılımlar + fiş önizleme */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {isLoading || !report ? (
              <>
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </>
            ) : (
              <>
                <BreakdownTable
                  title="Ödeme Yöntemine Göre"
                  rows={report.paymentBreakdown}
                  labels={PAYMENT_LABELS}
                  countHeader="Adet"
                  total={paymentTotal}
                />
                <BreakdownTable
                  title="Kanala Göre (Ticket)"
                  rows={report.sourceBreakdown}
                  labels={SOURCE_LABELS}
                  countHeader="Paket"
                  total={report.totalRevenue}
                  dots={SOURCE_DOT}
                />
                <CorporateTable
                  rows={report.corporateBreakdown}
                  total={report.corporateTotal}
                  open={report.corporateOpen}
                />
              </>
            )}
          </div>

          {/* Fiş önizleme — aynı instance yazdırma hedefi */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Receipt className="size-4" />
                  Fiş Önizleme
                </CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                {isLoading || !report ? (
                  <Skeleton className="h-96 w-[72mm] rounded-md" />
                ) : (
                  <EndOfDayReceipt report={report} />
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
