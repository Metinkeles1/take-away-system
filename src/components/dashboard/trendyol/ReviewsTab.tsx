"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getTrendyolReviewStats,
  getTrendyolReviews,
  forceSyncCustomers,
  type TrendyolReviewStatsResult,
  type TrendyolReviewsListResult,
  type TrendyolReviewsListFilters,
  type TrendyolReviewWithCustomer,
} from "@/actions/trendyolReviews";
import { forgetCustomer } from "@/actions/trendyolCustomerSnapshot";
import type { TrendyolReviewAnswerStatus } from "@/lib/integrations/trendyol/client";
import {
  Star,
  MessageSquare,
  RefreshCw,
  AlertTriangle,
  Utensils,
  Truck,
  Smile,
  ChevronLeft,
  ChevronRight,
  Phone,
  MapPin,
  Trash2,
  DatabaseZap,
  Calendar,
  ChefHat,
  Clock,
  Receipt,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type DeliveryFilter = "all" | "STORE" | "GO";
type CommentFilter = "all" | "with" | "without";
type AnswerStatusFilter = "all" | TrendyolReviewAnswerStatus;

const PAGE_SIZE = 20;

export function ReviewsTab() {
  const [stats, setStats] = useState<TrendyolReviewStatsResult | null>(null);
  const [list, setList] = useState<TrendyolReviewsListResult | null>(null);
  const [isStatsLoading, setStatsLoading] = useState(true);
  const [isListLoading, setListLoading] = useState(true);
  const [isSyncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [delivery, setDeliveryRaw] = useState<DeliveryFilter>("all");
  const [hasComment, setHasCommentRaw] = useState<CommentFilter>("all");
  const [answerStatus, setAnswerStatusRaw] = useState<AnswerStatusFilter>("all");

  // Filtre setter'ları page'i de sıfırlar — ayrı bir effect tetiklemeden
  // tek state update'inde halledilir, double-fire önlenir.
  const setDelivery = useCallback((v: DeliveryFilter) => {
    setDeliveryRaw(v);
    setPage(0);
  }, []);
  const setHasComment = useCallback((v: CommentFilter) => {
    setHasCommentRaw(v);
    setPage(0);
  }, []);
  const setAnswerStatus = useCallback((v: AnswerStatusFilter) => {
    setAnswerStatusRaw(v);
    setPage(0);
  }, []);

  const filters = useMemo<TrendyolReviewsListFilters>(
    () => ({
      page,
      size: PAGE_SIZE,
      deliveryType: delivery === "all" ? undefined : delivery,
      hasComment:
        hasComment === "all" ? undefined : hasComment === "with",
      restaurantAnswerStatus:
        answerStatus === "all" ? undefined : answerStatus,
    }),
    [page, delivery, hasComment, answerStatus],
  );

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await getTrendyolReviewStats());
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      setList(await getTrendyolReviews(filters));
    } finally {
      setListLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const refreshAll = () => {
    loadStats();
    loadList();
  };

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await forceSyncCustomers(30);
      if (res.ok) {
        setSyncMessage(
          res.upserted === 0
            ? "Yeni veri bulunamadı."
            : `${res.upserted} sipariş güncellendi.`,
        );
        // Listeyi yeniden yükle ki yeni snapshot'lar enrichment'a girsin
        await loadList();
      } else {
        setSyncMessage(`Senkron hatası: ${res.error ?? "bilinmeyen"}`);
      }
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  }, [loadList]);

  const handleForget = useCallback(
    async (orderNumber: string) => {
      const res = await forgetCustomer(orderNumber);
      if (res.ok) {
        // Liste local'de güncellensin (yeniden fetch yapmadan)
        setList((prev) =>
          prev
            ? {
                ...prev,
                reviews: prev.reviews.map((r) =>
                  r.customer?.orderNumber === orderNumber
                    ? { ...r, customer: undefined }
                    : r,
                ),
                enrichedCount: Math.max(0, prev.enrichedCount - 1),
              }
            : prev,
        );
      }
    },
    [],
  );

  const softLoading = isListLoading && !!list;

  return (
    <div className="relative space-y-4">
      {/* Top bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">
            Değerlendirmeler
          </h2>
          <p className="text-sm text-muted-foreground">
            Müşteri yorumları ve restoran puanları
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={isSyncing || isListLoading}
            className="h-8 gap-1.5"
            title="Son 30 günün müşteri bilgilerini Trendyol'dan yeniden çek"
          >
            <DatabaseZap
              className={`size-3.5 ${isSyncing ? "animate-pulse" : ""}`}
            />
            <span className="hidden sm:inline">
              {isSyncing ? "Senkronlanıyor…" : "Senkronla"}
            </span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={refreshAll}
            disabled={isStatsLoading || isListLoading}
            className="h-8 gap-1.5"
          >
            <RefreshCw
              className={`size-3.5 ${
                isStatsLoading || isListLoading ? "animate-spin" : ""
              }`}
            />
            <span className="hidden sm:inline">Yenile</span>
          </Button>
        </div>
      </div>

      {syncMessage && (
        <div className="rounded-md border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          {syncMessage}
        </div>
      )}

      {/* Stats banner / KPI */}
      <StatsRow result={stats} isLoading={isStatsLoading} />

      {/* Filtre bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Teslimat:</span>
            <Select
              value={delivery}
              onValueChange={(v) => setDelivery(v as DeliveryFilter)}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="STORE">Kendi Kuryem</SelectItem>
                <SelectItem value="GO">Trendyol Go</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Yorum:</span>
            <Select
              value={hasComment}
              onValueChange={(v) => setHasComment(v as CommentFilter)}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="with">Yorumlu</SelectItem>
                <SelectItem value="without">Yorumsuz</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Cevap durumu:</span>
            <Select
              value={answerStatus}
              onValueChange={(v) => setAnswerStatus(v as AnswerStatusFilter)}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="WAITING_FOR_APPROVE">Onay Bekliyor</SelectItem>
                <SelectItem value="APPROVED">Onaylandı</SelectItem>
                <SelectItem value="REJECTED">Reddedildi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div
        className={`space-y-3 transition-opacity ${
          softLoading ? "opacity-60 pointer-events-none" : "opacity-100"
        }`}
        aria-busy={softLoading}
      >
        {list?.error && (
          <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{list.error}</p>
          </div>
        )}

        {isListLoading && !list ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : list && list.reviews.length > 0 ? (
          <>
            {list.reviews.map((r) => (
              <ReviewCard key={r.reviewId} review={r} onForget={handleForget} />
            ))}
            <Pagination
              page={list.page}
              totalPages={list.totalPages}
              totalCount={list.totalCount}
              size={list.size}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              disabled={isListLoading}
            />
          </>
        ) : (
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={MessageSquare}
                text="Bu filtre için yorum bulunamadı"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Stats row (4 KPI) ─────────────────────────────────────────────

function StatsRow({
  result,
  isLoading,
}: {
  result: TrendyolReviewStatsResult | null;
  isLoading: boolean;
}) {
  if (isLoading && !result) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (!result?.available || !result.stats) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 pt-6 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium text-foreground">
              Puan istatistiği gösterilemiyor
            </p>
            <p className="mt-0.5 text-xs">
              {result?.error ??
                "Henüz yeterli değerlendirme yok (en az 3 puan gerekli)."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const s = result.stats;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ScoreCard
        label="Genel Puan"
        score={s.averageScores.overall}
        icon={Star}
        footer={`${s.ratingCount.toLocaleString("tr-TR")} oy · ${s.commentCount.toLocaleString("tr-TR")} yorum`}
      />
      <ScoreCard
        label="Lezzet"
        score={s.averageScores.flavor}
        icon={Smile}
      />
      <ScoreCard
        label="Servis"
        score={s.averageScores.service}
        icon={Utensils}
      />
      <ScoreCard
        label="Teslimat"
        score={s.averageScores.delivery}
        icon={Truck}
      />
    </div>
  );
}

function ScoreCard({
  label,
  score,
  icon: Icon,
  footer,
}: {
  label: string;
  score: number;
  icon: React.ComponentType<{ className?: string }>;
  footer?: string;
}) {
  const color =
    score >= 4 ? "text-emerald-600" : score >= 3 ? "text-amber-600" : "text-rose-600";

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <CardDescription className="text-sm font-medium text-muted-foreground">
          {label}
        </CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-baseline gap-2">
          <p className={`text-2xl font-bold tabular-nums tracking-tight ${color}`}>
            {score.toFixed(2)}
          </p>
          <Stars score={score} small />
        </div>
        {footer && <p className="text-xs text-muted-foreground">{footer}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Stars ─────────────────────────────────────────────────────────

function Stars({ score, small = false }: { score: number; small?: boolean }) {
  const size = small ? "size-3" : "size-4";
  const full = Math.floor(score);
  const hasHalf = score - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${score} / 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = i < full || (i === full && hasHalf);
        return (
          <Star
            key={i}
            className={`${size} ${filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
          />
        );
      })}
    </span>
  );
}

// ─── Review card ───────────────────────────────────────────────────

// ─── Yardımcılar ──────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} sa` : `${hours} sa ${rem} dk`;
}

function formatDateTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reviewDelayLabel(orderTs: number, reviewTs: number): string {
  if (!orderTs || !reviewTs) return "—";
  const diff = reviewTs - orderTs;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} dk sonra`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} sa sonra`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 gün sonra" : `${days} gün sonra`;
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0] || parts[0] === "—") return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Review Card (premium) ─────────────────────────────────────────

function ReviewCard({
  review,
  onForget,
}: {
  review: TrendyolReviewWithCustomer;
  onForget: (orderNumber: string) => void;
}) {
  const avg = review.rating.average;
  const sentimentColor =
    avg >= 4
      ? "from-emerald-400 to-teal-500"
      : avg >= 3
        ? "from-amber-400 to-orange-500"
        : "from-rose-400 to-pink-500";

  const customer = review.customer;
  const totalDeliveryMs =
    customer?.packageCreationDate && customer?.packageModificationDate
      ? customer.packageModificationDate - customer.packageCreationDate
      : 0;

  return (
    <article className="overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md">
      {/* ─── Üst bar: skor + tarih + chip'ler ─────────── */}
      <header
        className={`relative bg-linear-to-r ${sentimentColor} px-4 py-3 text-white`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,rgba(255,255,255,0.2),transparent_60%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Stars score={avg} />
            </div>
            <span className="text-lg font-bold tabular-nums">
              {avg.toFixed(1)}
            </span>
            <Badge className="bg-white/20 text-[10px] text-white hover:bg-white/25">
              #{review.orderParentId}
            </Badge>
            <Badge
              variant="outline"
              className="border-white/40 text-[10px] text-white"
            >
              {review.deliveryType === "GO" ? "Trendyol Go" : "Kendi Kuryem"}
            </Badge>
          </div>
          <span className="text-xs text-white/90 tabular-nums">
            {new Date(review.createdDate).toLocaleDateString("tr-TR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      </header>

      <div className="space-y-3 p-4 sm:p-5">
        {/* Skor kırılımı */}
        <div className="flex flex-wrap items-center gap-1.5">
          <ScoreChip label="Lezzet" value={review.rating.flavorScore} />
          <ScoreChip label="Servis" value={review.rating.serviceScore} />
          <ScoreChip label="Teslimat" value={review.rating.deliveryScore} />
        </div>

        {/* Müşteri yorumu */}
        {review.comment?.text && (
          <blockquote className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50/50 px-4 py-3 text-sm leading-relaxed">
            <span className="text-emerald-700 font-serif text-lg leading-none mr-1">
              &ldquo;
            </span>
            {review.comment.text}
          </blockquote>
        )}

        {/* Restoran cevabı */}
        {review.comment?.restaurantAnswer && (
          <RestaurantAnswer answer={review.comment.restaurantAnswer} />
        )}

        {/* Müşteri Profil Bloğu */}
        {customer && (
          <CustomerProfileBlock
            customer={customer}
            review={review}
            totalDeliveryMs={totalDeliveryMs}
            onForget={() => onForget(customer.orderNumber)}
          />
        )}
      </div>
    </article>
  );
}

// ─── Customer Profile Block (zengin) ───────────────────────────────

function CustomerProfileBlock({
  customer,
  review,
  totalDeliveryMs,
  onForget,
}: {
  customer: NonNullable<TrendyolReviewWithCustomer["customer"]>;
  review: TrendyolReviewWithCustomer;
  totalDeliveryMs: number;
  onForget: () => void;
}) {
  const onForgetClick = () => {
    const ok = window.confirm(
      `${customer.customerName || "Bu müşteri"} için kayıtlı bilgiyi silmek istediğine emin misin? Sadece yerel kaydın silinir, Trendyol'daki sipariş etkilenmez.`,
    );
    if (ok) onForget();
  };

  const hasAnyContent =
    !!customer.customerName ||
    !!customer.phone ||
    !!customer.addressFull ||
    (customer.lines && customer.lines.length > 0);

  if (!hasAnyContent) {
    return (
      <div className="rounded-xl border border-dashed bg-slate-50/50 px-3 py-2.5 text-center text-xs text-muted-foreground">
        Müşteri snapshot&apos;ı bu sipariş için bulunamadı
      </div>
    );
  }

  const orderTs = customer.packageCreationDate ?? 0;
  const reviewTs = review.createdDate;
  const orderProducts = customer.lines ?? [];

  return (
    <div className="rounded-2xl border bg-linear-to-br from-slate-50/80 to-white">
      {/* Üst: profil özeti */}
      <div className="flex items-start gap-3 border-b p-3.5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-slate-200 to-slate-300 text-sm font-bold text-slate-700">
          {avatarInitials(customer.customerName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">
            {customer.customerName || "İsimsiz Müşteri"}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
              >
                <Phone className="size-3" />
                <span className="tabular-nums">{customer.phone}</span>
              </a>
            )}
            {customer.district && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {customer.district}
                {customer.neighborhood && (
                  <span className="text-muted-foreground/70">
                    · {customer.neighborhood}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onForgetClick}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
          title="KVKK silme talebi — yerel kaydı sil"
        >
          <Trash2 className="size-3" />
          Unut
        </button>
      </div>

      {/* Adres tam */}
      {customer.addressFull && (
        <div className="flex items-start gap-2 border-b px-3.5 py-2.5 text-xs text-slate-700">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p className="leading-relaxed">{customer.addressFull}</p>
        </div>
      )}

      {/* Sipariş içerikleri */}
      {orderProducts.length > 0 && (
        <div className="border-b px-3.5 py-3">
          <div className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <Receipt className="size-3" />
            Sipariş İçeriği
          </div>
          <ul className="space-y-1">
            {orderProducts.slice(0, 5).map((line, i) => (
              <li
                key={`${line.productId ?? "x"}-${i}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-muted-foreground tabular-nums">
                    {line.quantity}×
                  </span>
                  <span className="truncate font-medium">{line.name}</span>
                </span>
                {line.unitSellingPrice > 0 && (
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {(line.unitSellingPrice * line.quantity).toLocaleString(
                      "tr-TR",
                      { style: "currency", currency: "TRY", maximumFractionDigits: 0 },
                    )}
                  </span>
                )}
              </li>
            ))}
            {orderProducts.length > 5 && (
              <li className="text-[10px] text-muted-foreground">
                +{orderProducts.length - 5} ürün daha
              </li>
            )}
          </ul>
          {customer.totalPrice > 0 && (
            <div className="mt-2 flex items-center justify-between border-t pt-1.5 text-xs">
              <span className="font-medium text-muted-foreground">Toplam</span>
              <span className="font-bold tabular-nums">
                {customer.totalPrice.toLocaleString("tr-TR", {
                  style: "currency",
                  currency: "TRY",
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Zamanlama metrikleri */}
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <TimelineMetric
          icon={Calendar}
          label="Sipariş"
          value={
            orderTs
              ? formatDateTime(orderTs).split(" ").slice(0, 2).join(" ")
              : "—"
          }
          sub={orderTs ? formatDateTime(orderTs).split(" ").slice(-1)[0] : ""}
          tone="emerald"
        />
        <TimelineMetric
          icon={ChefHat}
          label="Hazırlama"
          value={
            customer.preparationTime > 0
              ? `${customer.preparationTime} dk`
              : "—"
          }
          sub={customer.preparationTime > 0 ? "Tahmini" : ""}
          tone="violet"
        />
        <TimelineMetric
          icon={Truck}
          label="Teslimat"
          value={totalDeliveryMs > 0 ? formatDuration(totalDeliveryMs) : "—"}
          sub={totalDeliveryMs > 0 ? "Toplam süre" : ""}
          tone="amber"
        />
        <TimelineMetric
          icon={Clock}
          label="Yorum"
          value={reviewDelayLabel(orderTs, reviewTs)}
          sub="Sipariş sonrası"
          tone="rose"
        />
      </div>
    </div>
  );
}

function TimelineMetric({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone: "emerald" | "violet" | "amber" | "rose";
}) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  }[tone];

  return (
    <div className="rounded-xl border bg-white p-2.5">
      <div className={`mb-1.5 inline-flex size-7 items-center justify-center rounded-lg ${cls}`}>
        <Icon className="size-3.5" />
      </div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-sm font-bold tabular-nums">{value}</p>
      {sub && (
        <p className="truncate text-[9px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

function ScoreChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function RestaurantAnswer({
  answer,
}: {
  answer: NonNullable<
    NonNullable<TrendyolReviewWithCustomer["comment"]>["restaurantAnswer"]
  >;
}) {
  const STATUS_MAP: Record<
    TrendyolReviewAnswerStatus,
    { label: string; cls: string }
  > = {
    APPROVED: { label: "Onaylandı", cls: "border-emerald-300 bg-emerald-50" },
    WAITING_FOR_APPROVE: {
      label: "Onay Bekliyor",
      cls: "border-amber-300 bg-amber-50",
    },
    REJECTED: { label: "Reddedildi", cls: "border-rose-300 bg-rose-50" },
  };
  const statusInfo = STATUS_MAP[answer.status];

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${statusInfo.cls}`}>
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="font-semibold">Restoran cevabı</span>
        <Badge variant="outline" className="text-[10px]">
          {statusInfo.label}
        </Badge>
      </div>
      <p className="text-sm">{answer.text}</p>
      {answer.rejectedReason && (
        <p className="mt-1 text-[11px] text-rose-700">
          Red nedeni: {answer.rejectedReason.reason}
        </p>
      )}
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  totalCount,
  size,
  onPrev,
  onNext,
  disabled,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  size: number;
  onPrev: () => void;
  onNext: () => void;
  disabled: boolean;
}) {
  const from = totalCount === 0 ? 0 : page * size + 1;
  const to = Math.min(totalCount, (page + 1) * size);
  const canPrev = page > 0 && !disabled;
  const canNext = totalPages > 0 ? page + 1 < totalPages && !disabled : !disabled;

  return (
    <div className="flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} / {totalCount.toLocaleString("tr-TR")}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onPrev}
          disabled={!canPrev}
          className="h-8 gap-1"
        >
          <ChevronLeft className="size-3.5" />
          Önceki
        </Button>
        <span className="tabular-nums">
          Sayfa {page + 1}
          {totalPages > 0 && ` / ${totalPages}`}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onNext}
          disabled={!canNext}
          className="h-8 gap-1"
        >
          Sonraki
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
