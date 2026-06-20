"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin, MapPinOff, ShoppingBag, Wallet, ChevronRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentBreakdown } from "@/components/dashboard/PaymentBreakdown";
import { formatCurrency } from "@/lib/utils";
import { type OrderRegionStats } from "@/actions/dashboard";

// Leaflet sadece client-side — bundle'ı düşürmek için lazy.
const RegionsMap = dynamic(
  () =>
    import("@/components/dashboard/trendyol/RegionsMap").then((m) => ({
      default: m.RegionsMap,
    })),
  { ssr: false, loading: () => <Skeleton className="h-[480px] w-full rounded-xl" /> },
);

const STATUS_LABELS: Record<string, string> = {
  pending: "Beklemede",
  preparing: "Hazırlanıyor",
  "on-the-way": "Yolda",
  delivered: "Teslim edildi",
};

interface Props {
  data: OrderRegionStats | null;
  isLoading: boolean;
  /** Gün etiketi: "Bugün" / "Dün" / "Çar 11 Haz" */
  label: string;
}

export function OrderRegionsTab({ data, isLoading, label }: Props) {
  const payments = data?.payments;
  const paymentTotal = payments
    ? payments.cash + payments.card + payments.online + payments.meal_card + payments.iban
    : 0;

  const pinned = data?.pinnedCount ?? 0;
  const unpinnedCount = data?.unpinnedCount ?? 0;
  const totalOrders = data?.totalOrders ?? 0;
  const pinnedPct = totalOrders > 0 ? Math.round((pinned / totalOrders) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Özet kartlar */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={Wallet}
          tone="emerald"
          title={`${label} Toplam Satış`}
          value={isLoading ? null : formatCurrency(data?.totalRevenue ?? 0)}
        />
        <SummaryCard
          icon={ShoppingBag}
          tone="blue"
          title="Sipariş Sayısı"
          value={isLoading ? null : `${totalOrders}`}
        />
        <SummaryCard
          icon={MapPin}
          tone="violet"
          title="Konumu Pinli"
          value={isLoading ? null : `${pinned} / ${totalOrders}`}
          hint={isLoading ? undefined : `%${pinnedPct}`}
        />
      </div>

      {/* Harita */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-violet-600" />
            Sipariş Haritası
          </CardTitle>
          <CardDescription>
            {label} · kurye konumu yakalanan {pinned} sipariş pinlendi
            {unpinnedCount > 0 && ` · ${unpinnedCount} sipariş konumsuz (aşağıda)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[480px] w-full rounded-xl" />
          ) : pinned > 0 ? (
            <>
              <RegionsMap pins={data!.pins} bounds={data!.bounds} />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <Legend color="#3b82f6" label="Beklemede" />
                <Legend color="#f59e0b" label="Hazırlanıyor" />
                <Legend color="#f97316" label="Yolda" />
                <Legend color="#10b981" label="Teslim edildi" />
              </div>
            </>
          ) : (
            <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <MapPinOff className="size-8 opacity-40" />
              <p>Bu gün kurye tarafından konumu yakalanan sipariş yok.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* İlçe kırılımı + ödeme yöntemi */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>İlçe / Bölge Kırılımı</CardTitle>
            <CardDescription>{label} · sipariş sayısına göre</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (data?.districts.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Bu gün sipariş yok.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {data!.districts.map((d) => {
                  const pct =
                    totalOrders > 0
                      ? Math.round((d.orderCount / totalOrders) * 100)
                      : 0;
                  return (
                    <li key={d.district} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex min-w-0 items-center gap-1.5 font-medium">
                          <span className="truncate">{d.district}</span>
                          {d.pinnedCount < d.orderCount && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              ({d.pinnedCount}/{d.orderCount} pinli)
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatCurrency(d.revenue)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-violet-500 transition-all duration-500"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {d.orderCount} sip · %{pct}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ödeme Yöntemi Dağılımı</CardTitle>
            <CardDescription>{label} · yönteme göre tahsilat</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <PaymentBreakdown
                data={payments}
                total={paymentTotal}
                totalLabel="Gün Toplamı"
                emptyText="Bu gün tahsilat yok."
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Konumu eksik siparişler */}
      {!isLoading && unpinnedCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinOff className="size-4 text-amber-600" />
              Konumu Eksik Siparişler
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {unpinnedCount}
              </span>
            </CardTitle>
            <CardDescription>
              Kurye GPS yakalamamış — konum adresten tahminidir, haritada
              gösterilmez.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {data!.unpinned.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/orders/${o.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="rounded-lg bg-amber-100 p-2">
                      <MapPinOff className="size-4 text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        #{o.orderNumber} · {o.customerName}
                        {o.district && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {o.district}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.address || "Adres yok"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(o.total)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {STATUS_LABELS[o.status] ?? o.status}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const TONES: Record<string, { bg: string; text: string }> = {
  emerald: { bg: "bg-emerald-100", text: "text-emerald-700" },
  blue: { bg: "bg-blue-100", text: "text-blue-700" },
  violet: { bg: "bg-violet-100", text: "text-violet-700" },
};

function SummaryCard({
  icon: Icon,
  tone,
  title,
  value,
  hint,
}: {
  icon: React.ElementType;
  tone: keyof typeof TONES;
  title: string;
  value: string | null;
  hint?: string;
}) {
  const t = TONES[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-xl p-2.5 ${t.bg}`}>
          <Icon className={`size-5 ${t.text}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          {value === null ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p className={`mt-0.5 text-xl font-semibold tabular-nums ${t.text}`}>
              {value}
              {hint && (
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {hint}
                </span>
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
