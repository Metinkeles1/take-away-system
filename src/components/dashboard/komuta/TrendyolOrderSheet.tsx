"use client";

import { useEffect, useState } from "react";
import { Bike, Calendar, MapPin, MessageSquareText, Phone, Repeat, Star, Timer, Wallet } from "lucide-react";

import {
  getTrendyolOrderDetail,
  type TrendyolOrderDetail,
  type TrendyolOrderReview,
} from "@/actions/trendyolArchive";
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
import { cn, formatCurrency } from "@/lib/utils";

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
      <SheetContent className="overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
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
            <SheetHeader className="border-b pr-12">
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
                {d.review?.average != null && (
                  <Badge variant="outline" className={cn("gap-1 text-[10px]", scoreClass(d.review.average))}>
                    <Star className="size-3 fill-current" />
                    {fmtScore(d.review.average)}
                  </Badge>
                )}
              </div>
              <SheetDescription className="text-left">
                {d.customerName} · {fmtDateTime(d.createdAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-4 sm:p-6">
              {d.review && <ReviewCard review={d.review} />}

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
                {d.customerNote && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                    <MessageSquareText className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Müşteri notu</p>
                      <p className="whitespace-pre-line wrap-break-word">{d.customerNote}</p>
                    </div>
                  </div>
                )}
                {d.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ürün bilgisi yok.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {d.lines.map((l, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium tabular-nums">{l.quantity}×</span> {l.name}
                          {(l.modifiers.length > 0 || l.extras.length > 0 || l.removed.length > 0) && (
                            <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                              {l.modifiers.map((m, j) => (
                                <span key={`m${j}`} className="text-muted-foreground">{m}</span>
                              ))}
                              {l.extras.map((e, j) => (
                                <span key={`e${j}`} className="text-emerald-700 dark:text-emerald-400">+ {e}</span>
                              ))}
                              {l.removed.map((r, j) => (
                                <span key={`r${j}`} className="font-medium text-red-600 dark:text-red-400">
                                  {r} yok
                                </span>
                              ))}
                            </span>
                          )}
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

// Puan rengi: 4+ iyi, 3–4 orta, altı kötü (Trendyol puanları 1–5).
function scoreClass(score: number): string {
  if (score >= 4) return "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400";
  if (score >= 3) return "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400";
  return "border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-400";
}

const fmtScore = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

const ANSWER_STATUS: Record<string, string> = {
  WAITING_FOR_APPROVE: "onay bekliyor",
  APPROVED: "yayında",
  REJECTED: "reddedildi",
};

function ReviewCard({ review }: { review: TrendyolOrderReview }) {
  const scores = [
    { label: "Lezzet", value: review.flavor },
    { label: "Servis", value: review.service },
    { label: "Teslimat", value: review.delivery },
  ];
  const bad = review.average != null && review.average < 3;
  return (
    <section
      className={cn(
        "rounded-lg border p-3",
        bad && "border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Star className="size-3.5" /> Müşteri değerlendirmesi
        </span>
        {review.createdAt && (
          <span className="text-[11px] text-muted-foreground">{fmtDateTime(review.createdAt)}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {scores.map((s) => (
          <div key={s.label} className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p
              className={cn(
                "text-base font-semibold tabular-nums",
                s.value != null && s.value < 3 && "text-rose-600 dark:text-rose-400",
              )}
            >
              {s.value != null ? fmtScore(s.value) : "—"}
            </p>
          </div>
        ))}
      </div>
      {review.comment ? (
        <p className="mt-3 whitespace-pre-line text-sm wrap-break-word">“{review.comment}”</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Yorum yazmadı, yalnız puan verdi.</p>
      )}
      {review.answer && (
        <div className="mt-2 border-l-2 pl-3 text-sm">
          <p className="text-[11px] font-medium text-muted-foreground">
            Senin cevabın
            {review.answerStatus && ANSWER_STATUS[review.answerStatus]
              ? ` · ${ANSWER_STATUS[review.answerStatus]}`
              : ""}
          </p>
          <p className="whitespace-pre-line wrap-break-word">{review.answer}</p>
        </div>
      )}
    </section>
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
      <p className="text-sm font-semibold wrap-break-word">{value}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
