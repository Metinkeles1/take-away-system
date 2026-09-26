"use client";

import { useEffect, useState } from "react";
import { Bike, Calendar, MapPin, Phone, Repeat, Timer, Wallet } from "lucide-react";

import { getTrendyolOrderDetail, type TrendyolOrderDetail } from "@/actions/trendyolArchive";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  Created: "Yeni",
  Picking: "Hazırlanıyor",
  Invoiced: "Hazır",
  Shipped: "Yolda",
  Delivered: "Teslim edildi",
  Cancelled: "İptal",
  UnSupplied: "Karşılanamadı",
};

function fmtDateTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

// Trendyol siparişinin tam detayı (arşivden): içerik, adres, ödeme, hakediş,
// teslim ve müşterinin geçmişi. orderNumber null → kapalı.
export function TrendyolOrderSheet({
  orderNumber,
  onClose,
}: {
  orderNumber: string | null;
  onClose: () => void;
}) {
  const [fetched, setFetched] = useState<{ key: string; data: TrendyolOrderDetail | null } | null>(
    null,
  );

  useEffect(() => {
    if (!orderNumber) return;
    let alive = true;
    getTrendyolOrderDetail(orderNumber).then((d) => {
      if (alive) setFetched({ key: orderNumber, data: d });
    });
    return () => {
      alive = false;
    };
  }, [orderNumber]);

  const loaded = fetched && fetched.key === orderNumber ? fetched : null;
  const d = loaded?.data ?? null;

  return (
    <Sheet open={!!orderNumber} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md">
        {!loaded ? (
          <div className="space-y-4 p-6">
            <SheetHeader className="sr-only">
              <SheetTitle>#{orderNumber}</SheetTitle>
              <SheetDescription>Trendyol sipariş detayı yükleniyor</SheetDescription>
            </SheetHeader>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !d ? (
          <div className="p-6">
            <SheetHeader className="p-0">
              <SheetTitle>#{orderNumber}</SheetTitle>
              <SheetDescription>Bu sipariş arşivde bulunamadı.</SheetDescription>
            </SheetHeader>
          </div>
        ) : (
          <>
            <SheetHeader className="border-b">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-left">#{d.orderNumber}</SheetTitle>
                <Badge
                  variant={d.status === "Cancelled" || d.status === "UnSupplied" ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {STATUS_LABEL[d.status] ?? d.status}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {d.deliveryType === "GO" ? "Trendyol Go kuryesi" : "Kendi kuryemiz"}
                </Badge>
              </div>
              <SheetDescription className="text-left">
                {d.customerName} · {fmtDateTime(d.createdAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-4 sm:p-6">
              {/* Para */}
              <section className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Wallet className="size-3.5" /> Ödeme ve hakediş
                </div>
                <Row label="Sipariş tutarı" value={formatCurrency(d.gross)} />
                {d.sellerDiscount > 0 && (
                  <Row label="Senin karşıladığın indirim" value={`− ${formatCurrency(d.sellerDiscount)}`} />
                )}
                <Row label="Müşterinin ödediği" value={formatCurrency(d.paid)} />
                <Row label="Ödeme yöntemi" value={d.paymentLabel} />
                {d.commission != null && d.commission !== 0 && (
                  <Row label="Trendyol komisyonu" value={`− ${formatCurrency(d.commission)}`} />
                )}
                <Separator className="my-2" />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Sana yatacak</span>
                  <span className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {d.netEstimated ? "~" : ""}
                    {formatCurrency(d.net)}
                  </span>
                </div>
                {d.netEstimated && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Tahmini — Trendyol ödeme kaydı henüz oluşmadı (yemek kartı ödemeleri hiç
                    oluşmaz). Kayıt gelince gerçek tutar yazılır.
                  </p>
                )}
              </section>

              {/* İçerik */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Sipariş içeriği</h3>
                {d.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ürün bilgisi yok.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {d.lines.map((l, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium tabular-nums">{l.quantity}×</span> {l.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatCurrency(l.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Adres */}
              <section className="space-y-2">
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 text-sm">
                    {d.street ? (
                      <>
                        <p className="font-medium">{d.street}</p>
                        {d.building && <p>{d.building}</p>}
                        <p className="text-muted-foreground">
                          {[d.neighborhood, d.district, d.city].filter(Boolean).join(", ")}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">
                          {[d.neighborhood, d.district, d.city].filter(Boolean).join(", ") || "—"}
                        </p>
                        {d.building && <p>{d.building}</p>}
                        <p className="text-[11px] text-muted-foreground">
                          Açık adres bu siparişte kayıtlı değil (arşive eklenmeden önceki sipariş).
                        </p>
                      </>
                    )}
                    {d.addressDescription && (
                      <p className="mt-1 text-muted-foreground">Tarif: {d.addressDescription}</p>
                    )}
                    {d.lat != null && d.lng != null && (
                      <a
                        href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                      >
                        Haritada aç →
                      </a>
                    )}
                  </div>
                </div>
                {d.phone && (
                  <a
                    href={`tel:${d.phone}`}
                    className="flex items-center gap-3 rounded-lg border p-3 text-sm transition hover:bg-muted/50"
                  >
                    <Phone className="size-4 shrink-0 text-muted-foreground" />
                    <span className="tabular-nums">{d.phone}</span>
                  </a>
                )}
              </section>

              {/* Teslim */}
              <section className="grid grid-cols-2 gap-2">
                <Stat
                  icon={Timer}
                  label="Teslim süresi"
                  value={d.deliveryDurationMin != null ? `${d.deliveryDurationMin} dk` : "—"}
                  sub={
                    d.deliveryTimeSource === "courier"
                      ? "kurye ekranından"
                      : d.deliveryTimeSource === "trendyol"
                        ? "Trendyol kaydından"
                        : undefined
                  }
                />
                <Stat icon={Bike} label="Kurye" value={d.courier ?? "—"} />
                <Stat icon={Calendar} label="Teslim anı" value={fmtDateTime(d.deliveredAt)} />
                <Stat
                  icon={Repeat}
                  label="Bu müşteri"
                  value={d.customerOrderCount > 0 ? `${d.customerOrderCount} sipariş` : "—"}
                  sub={
                    d.customerOrderCount > 0
                      ? `toplam ${formatCurrency(d.customerTotal)}`
                      : undefined
                  }
                />
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <Icon className="mb-1 size-4 text-muted-foreground" />
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
