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
  Receipt,
  Wallet,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { AllCustomersTab } from "@/components/dashboard/trendyol/AllCustomersTab";
import { formatCurrency } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  Created: "Yeni",
  Picking: "Kabul",
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0] || parts[0] === "—") return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeDate(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const d = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (d <= 0) return "bugün";
  if (d === 1) return "dün";
  return `${d} gün önce`;
}

export default function TrendyolCustomersPage() {
  const [view, setView] = useState<"analytics" | "all">("analytics");
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const [data, setData] = useState<CustomerAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTop, setSelectedTop] = useState<TopCustomer | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await getTrendyolCustomerAnalytics(period));
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (view === "analytics") load();
  }, [load, view]);

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────── */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Müşteriler</h1>
          <p className="text-sm text-muted-foreground">
            Trendyol Go siparişlerinden müşteri analizi ve detay
          </p>
        </div>
      </header>

      {/* ── Tabs ──────────────────────────────────────── */}
      <Tabs value={view} onValueChange={(v) => setView(v as "analytics" | "all")}>
        <TabsList>
          <TabsTrigger value="analytics" className="gap-1.5">
            <Trophy className="size-3.5" />
            Genel Bakış
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5">
            <Users className="size-3.5" />
            Tüm Müşteriler
          </TabsTrigger>
        </TabsList>

        {/* ── Genel Bakış (Analitik) ───────────────────── */}
        <TabsContent value="analytics" className="mt-4 space-y-4">
          {/* Period kontrolü */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {PERIOD_LABEL[period]} verisiyle hesaplandı
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={period}
                onValueChange={(v) => setPeriod(v as AnalyticsPeriod)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Son 7 Gün</SelectItem>
                  <SelectItem value="month">Son 30 Gün</SelectItem>
                  <SelectItem value="quarter">Son 90 Gün</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={load}
                disabled={isLoading}
                aria-label="Yenile"
              >
                <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {data?.error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Veri alınamadı</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {data.error}
                </p>
              </div>
            </div>
          )}

          {/* KPI satırı */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Eşsiz Müşteri"
              value={data ? data.uniqueCustomers.toLocaleString("tr-TR") : null}
              icon={Users}
              hint={data ? `${data.totalOrders} sipariş` : ""}
              loading={isLoading && !data}
            />
            <KpiCard
              label="Yeni Müşteri"
              value={data ? data.newCustomers.toLocaleString("tr-TR") : null}
              icon={UserPlus}
              hint={
                data && data.uniqueCustomers > 0
                  ? `%${((data.newCustomers / data.uniqueCustomers) * 100).toFixed(0)}`
                  : ""
              }
              loading={isLoading && !data}
            />
            <KpiCard
              label="Tekrar Eden"
              value={data ? data.repeatCustomers.toLocaleString("tr-TR") : null}
              icon={Repeat}
              hint={
                data ? `%${(data.repeatRate * 100).toFixed(0)} oran` : ""
              }
              loading={isLoading && !data}
            />
            <KpiCard
              label="Müşteri Başına"
              value={data ? formatCurrency(data.avgRevenuePerCustomer) : null}
              icon={Wallet}
              hint={
                data
                  ? `Ort. ${data.avgOrdersPerCustomer.toFixed(1)} sipariş`
                  : ""
              }
              loading={isLoading && !data}
            />
          </div>

          {/* Frequency + Top customers */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Sipariş Frekansı</CardTitle>
                <CardDescription>Kaç müşteri kaç sipariş verdi</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading && !data ? (
                  <Skeleton className="h-56 w-full" />
                ) : data && data.uniqueCustomers > 0 ? (
                  <FrequencyChart buckets={data.frequencyBuckets} />
                ) : (
                  <div className="flex h-56 items-center justify-center">
                    <EmptyState icon={Users} text="Bu dönemde veri yok" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Top Müşteriler</CardTitle>
                  <CardDescription>Ciro bazlı ilk 10</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading && !data ? (
                  <Skeleton className="h-64 w-full" />
                ) : data && data.topCustomers.length ? (
                  <TopCustomersList
                    customers={data.topCustomers}
                    onSelect={setSelectedTop}
                  />
                ) : (
                  <EmptyState icon={Users} text="Bu dönemde veri yok" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top customer detail sheet */}
          <TopCustomerSheet
            customer={selectedTop}
            onClose={() => setSelectedTop(null)}
          />
        </TabsContent>

        {/* ── Tüm Müşteriler ───────────────────────────── */}
        <TabsContent value="all" className="mt-4">
          <AllCustomersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  loading,
}: {
  label: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] space-y-0">
        <CardDescription className="text-sm font-medium text-muted-foreground">
          {label}
        </CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {value ?? "—"}
          </p>
        )}
        {loading ? (
          <Skeleton className="h-3 w-20" />
        ) : (
          <p className="text-xs text-muted-foreground">{hint}</p>
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
    <ul className="space-y-3.5">
      {buckets.map((b) => {
        const pct = (b.customers / max) * 100;
        return (
          <li key={b.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{b.label}</span>
              <span className="text-xs tabular-nums">
                <span className="font-semibold">{b.customers}</span>
                <span className="ml-1.5 text-muted-foreground">
                  %{b.pct.toFixed(0)}
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Top Customers ──────────────────────────────────────────────────

function TopCustomersList({
  customers,
  onSelect,
}: {
  customers: TopCustomer[];
  onSelect: (c: TopCustomer) => void;
}) {
  return (
    <ul className="divide-y">
      {customers.map((c, i) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c)}
            className="group flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/40"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {getInitials(c.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {c.orderCount} sipariş · {relativeDate(c.lastOrderAt)}
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

// ─── Top Customer Sheet (analytics ile uyumlu) ──────────────────────

function TopCustomerSheet({
  customer,
  onClose,
}: {
  customer: TopCustomer | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">
        {customer && (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {getInitials(customer.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-left">
                    {customer.name}
                  </SheetTitle>
                  <SheetDescription className="text-left">
                    {customer.orderCount} sipariş ·{" "}
                    {formatCurrency(customer.revenue)}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5 p-4 sm:p-6">
              {/* KPI satırı */}
              <div className="grid grid-cols-3 gap-2">
                <StatBlock
                  icon={Receipt}
                  label="Ort. Sepet"
                  value={formatCurrency(customer.avgBasket)}
                />
                <StatBlock
                  icon={Repeat}
                  label="Sipariş"
                  value={String(customer.orderCount)}
                />
                <StatBlock
                  icon={Wallet}
                  label="Ödeme"
                  value={customer.preferredPayment ?? "—"}
                />
              </div>

              {/* İletişim */}
              {(customer.phone || customer.district) && (
                <section className="space-y-2.5">
                  {customer.phone && (
                    <a
                      href={`tel:${customer.phone}`}
                      className="flex items-center gap-3 rounded-md border p-3 transition hover:bg-muted/50"
                    >
                      <Phone className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          Telefon
                        </p>
                        <p className="font-medium tabular-nums">
                          {customer.phone}
                        </p>
                      </div>
                    </a>
                  )}
                  {(customer.district ||
                    customer.neighborhood ||
                    customer.addressLine) && (
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Adres</p>
                        <p className="text-sm font-medium">
                          {[customer.district, customer.neighborhood]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                        {customer.addressLine && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {customer.addressLine}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <Separator />

              {/* Recent orders */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Son Siparişler</h3>
                {customer.recentOrders.length === 0 ? (
                  <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                    Sipariş yok
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {customer.recentOrders.map((o) => (
                      <li
                        key={o.orderNumber}
                        className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium tabular-nums">
                            #{o.orderNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.createdAt).toLocaleDateString(
                              "tr-TR",
                              {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold tabular-nums">
                            {formatCurrency(o.total)}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {STATUS_LABEL[o.status] ?? o.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <Icon className="mb-1.5 size-4 text-muted-foreground" />
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
