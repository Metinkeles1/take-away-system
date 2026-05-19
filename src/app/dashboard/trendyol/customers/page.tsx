"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  RefreshCw,
  Users,
  UserPlus,
  Repeat,
  Trophy,
  Phone,
  MapPin,
  CreditCard,
  Receipt,
  ChevronRight,
} from "lucide-react";
import {
  getTrendyolCustomerAnalytics,
  type CustomerAnalytics,
  type TopCustomer,
  type AnalyticsPeriod,
} from "@/actions/trendyolAnalytics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  Created: "Yeni",
  Picking: "Kabul Edildi",
  Invoiced: "Hazırlandı",
  Shipped: "Yolda",
  Delivered: "Teslim",
  Cancelled: "İptal",
  UnSupplied: "Karşılanamadı",
};

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  week: "Son 7 Gün",
  month: "Son 30 Gün",
  quarter: "Son 90 Gün",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0] || parts[0] === "—") return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function daysAgo(ts: number): string {
  const diff = Date.now() - ts;
  const d = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (d <= 0) return "bugün";
  if (d === 1) return "dün";
  return `${d} gün önce`;
}

export default function TrendyolCustomersPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const [data, setData] = useState<CustomerAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<TopCustomer | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await getTrendyolCustomerAnalytics(period));
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">Müşteri Analizi</h2>
          <p className="text-sm text-muted-foreground">
            {PERIOD_LABEL[period]} · Tekrar oranı, frekans ve top müşteriler
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as AnalyticsPeriod)}>
            <TabsList>
              <TabsTrigger value="week" disabled={isLoading}>7 Gün</TabsTrigger>
              <TabsTrigger value="month" disabled={isLoading}>30 Gün</TabsTrigger>
              <TabsTrigger value="quarter" disabled={isLoading}>90 Gün</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={load} disabled={isLoading} className="h-8 gap-1.5">
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>
      </div>

      {data?.error && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Veri alınamadı</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{data.error}</p>
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Eşsiz Müşteri"
          value={data ? data.uniqueCustomers.toLocaleString("tr-TR") : null}
          icon={Users}
          footer={data ? `${data.totalOrders} sipariş` : ""}
          loading={isLoading && !data}
        />
        <KpiCard
          label="Yeni Müşteri"
          value={data ? data.newCustomers.toLocaleString("tr-TR") : null}
          icon={UserPlus}
          footer={
            data && data.uniqueCustomers > 0
              ? `Yeni oranı %${((data.newCustomers / data.uniqueCustomers) * 100).toFixed(0)}`
              : ""
          }
          loading={isLoading && !data}
        />
        <KpiCard
          label="Tekrar Eden"
          value={data ? data.repeatCustomers.toLocaleString("tr-TR") : null}
          icon={Repeat}
          footer={data ? `Tekrar oranı %${(data.repeatRate * 100).toFixed(0)}` : ""}
          loading={isLoading && !data}
        />
        <KpiCard
          label="Müşteri Başına"
          value={data ? formatCurrency(data.avgRevenuePerCustomer) : null}
          icon={Trophy}
          footer={
            data
              ? `Ortalama ${data.avgOrdersPerCustomer.toFixed(1)} sipariş`
              : ""
          }
          loading={isLoading && !data}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Sipariş Frekansı</CardTitle>
            <CardDescription>Kaç müşteri kaç sipariş verdi</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-64 w-full" />
            ) : data && data.uniqueCustomers > 0 ? (
              <FrequencyChart buckets={data.frequencyBuckets} />
            ) : (
              <div className="flex h-64 items-center justify-center">
                <EmptyState icon={Users} text="Bu dönemde müşteri verisi yok" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Top Müşteriler</CardTitle>
            <CardDescription>İlk 10 · ciro bazlı</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-64 w-full" />
            ) : data && data.topCustomers.length ? (
              <TopCustomersList
                customers={data.topCustomers}
                onSelect={setSelected}
              />
            ) : (
              <EmptyState icon={Users} text="Bu dönemde veri yok" />
            )}
          </CardContent>
        </Card>
      </div>

      <CustomerDetailDialog
        customer={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

// ─── KPI ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  footer,
  loading,
}: {
  label: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  footer: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <CardDescription className="text-sm font-medium text-muted-foreground">
          {label}
        </CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {value ?? "—"}
          </p>
        )}
        {loading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <p className="text-xs text-muted-foreground">{footer}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Frequency chart ────────────────────────────────────────────────

function FrequencyChart({
  buckets,
}: {
  buckets: CustomerAnalytics["frequencyBuckets"];
}) {
  const max = Math.max(...buckets.map((b) => b.customers), 1);
  return (
    <ul className="space-y-4">
      {buckets.map((b, i) => {
        const pct = (b.customers / max) * 100;
        return (
          <li key={b.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{b.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{b.customers}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  %{b.pct.toFixed(0)}
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(pct, 3)}%`,
                  background: `var(--chart-${(i % 5) + 1})`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Top customers ──────────────────────────────────────────────────

function TopCustomersList({
  customers,
  onSelect,
}: {
  customers: TopCustomer[];
  onSelect: (c: TopCustomer) => void;
}) {
  return (
    <ul className="space-y-2">
      {customers.map((c, i) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c)}
            className="group flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-muted/60"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-foreground/80"
              style={{ background: "var(--muted)" }}
            >
              {initials(c.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {c.orderCount} sipariş · son: {daysAgo(c.lastOrderAt)}
                {c.district && ` · ${c.district}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrency(c.revenue)}
              </p>
              {c.preferredPayment && (
                <p className="text-[10px] text-muted-foreground">
                  {c.preferredPayment}
                </p>
              )}
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Detail dialog ──────────────────────────────────────────────────

function CustomerDetailDialog({
  customer,
  onClose,
}: {
  customer: TopCustomer | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {customer && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span
                  className="flex size-10 items-center justify-center rounded-full text-sm font-bold text-foreground/80"
                  style={{ background: "var(--muted)" }}
                >
                  {initials(customer.name)}
                </span>
                <span>{customer.name}</span>
              </DialogTitle>
              <DialogDescription>
                {customer.orderCount} sipariş · {formatCurrency(customer.revenue)} toplam
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Mini KPI row */}
              <div className="grid grid-cols-3 gap-2">
                <MiniStat
                  icon={Receipt}
                  label="Ortalama Sepet"
                  value={formatCurrency(customer.avgBasket)}
                />
                <MiniStat
                  icon={Repeat}
                  label="Sipariş Sayısı"
                  value={String(customer.orderCount)}
                />
                <MiniStat
                  icon={CreditCard}
                  label="Tercih Ödeme"
                  value={customer.preferredPayment ?? "—"}
                />
              </div>

              <Separator />

              {/* Contact */}
              <div className="space-y-2 text-sm">
                {customer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 shrink-0 text-muted-foreground" />
                    <a
                      href={`tel:${customer.phone}`}
                      className="font-medium tabular-nums hover:underline"
                    >
                      {customer.phone}
                    </a>
                  </div>
                )}
                {(customer.district || customer.neighborhood || customer.addressLine) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {[customer.district, customer.neighborhood]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {customer.addressLine && (
                        <p className="text-xs text-muted-foreground">
                          {customer.addressLine}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Recent orders */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Son Siparişler
                </p>
                {customer.recentOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sipariş yok</p>
                ) : (
                  <ul className="space-y-1.5">
                    {customer.recentOrders.map((o) => (
                      <li
                        key={o.orderNumber}
                        className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold tabular-nums">
                            #{o.orderNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.createdAt).toLocaleDateString("tr-TR", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold tabular-nums">
                            {formatCurrency(o.total)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {STATUS_LABEL[o.status] ?? o.status}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="size-3 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
