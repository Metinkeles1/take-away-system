"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTrendyolReviewStats,
  getTrendyolReviews,
  forceSyncCustomers,
  type TrendyolReviewStatsResult,
  type TrendyolReviewsListResult,
  type TrendyolReviewsListFilters,
  type TrendyolReviewWithCustomer,
} from "@/actions/trendyolReviews";
import type {
  TrendyolReview,
  TrendyolReviewAnswerStatus,
} from "@/lib/integrations/trendyol/client";
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
  DatabaseZap,
  Calendar,
  ChefHat,
  Clock,
  Filter as FilterIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ─── Tipler & sabitler ─────────────────────────────────────────────

type DeliveryFilter = "all" | "STORE" | "GO";
type CommentFilter = "all" | "with" | "without";
type AnswerStatusFilter = "all" | TrendyolReviewAnswerStatus;

const PAGE_SIZE = 20;

const ANSWER_STATUS_LABEL: Record<
  TrendyolReviewAnswerStatus,
  { label: string; tone: "success" | "warning" | "destructive" }
> = {
  APPROVED: { label: "Onaylandı", tone: "success" },
  WAITING_FOR_APPROVE: { label: "Onay Bekliyor", tone: "warning" },
  REJECTED: { label: "Reddedildi", tone: "destructive" },
};

// ─── Yardımcılar ──────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0] || parts[0] === "—") return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimeOnly(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeDate(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const d = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (d <= 0) return "Bugün";
  if (d === 1) return "Dün";
  if (d < 7) return `${d} gün önce`;
  if (d < 30) return `${Math.floor(d / 7)} hafta önce`;
  return new Date(ts).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
  });
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} sa` : `${hours} sa ${rem} dk`;
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

function scoreTone(score: number): "good" | "warn" | "bad" {
  if (score >= 4) return "good";
  if (score >= 3) return "warn";
  return "bad";
}

// ─── Ana Tab ──────────────────────────────────────────────────────

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

  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  // Filter setter'ları aynı state update'inde page'i sıfırlar.
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
            ? "Yeni veri yok."
            : `${res.upserted} sipariş güncellendi.`,
        );
        await loadList();
      } else {
        setSyncMessage(`Senkron hatası: ${res.error ?? "bilinmeyen"}`);
      }
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  }, [loadList]);

  const selectedReview = useMemo(
    () => list?.reviews.find((r) => r.reviewId === selectedReviewId) ?? null,
    [list, selectedReviewId],
  );

  // Defansif dedup — sunucu cache'i bir şekilde duplicate gönderirse
  // React duplicate-key uyarısı vermesin.
  const uniqueReviews = useMemo(() => {
    if (!list) return [];
    const seen = new Set<string>();
    const out: typeof list.reviews = [];
    for (const r of list.reviews) {
      if (seen.has(r.reviewId)) continue;
      seen.add(r.reviewId);
      out.push(r);
    }
    return out;
  }, [list]);

  // Aktif filtre sayısı (chip rozeti için)
  const activeFilters =
    (delivery !== "all" ? 1 : 0) +
    (hasComment !== "all" ? 1 : 0) +
    (answerStatus !== "all" ? 1 : 0);

  const softLoading = isListLoading && !!list;

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Değerlendirmeler
          </h2>
          <p className="text-sm text-muted-foreground">
            Müşteri yorumları, puanlar ve cevap durumları
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing || isListLoading}
            className="gap-1.5"
            title="Son 30 günü Trendyol'dan yeniden çek"
          >
            <DatabaseZap
              className={`size-4 ${isSyncing ? "animate-pulse" : ""}`}
            />
            <span className="hidden sm:inline">
              {isSyncing ? "Senkronlanıyor" : "Senkronla"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={refreshAll}
            disabled={isStatsLoading || isListLoading}
            aria-label="Yenile"
          >
            <RefreshCw
              className={`size-4 ${
                isStatsLoading || isListLoading ? "animate-spin" : ""
              }`}
            />
          </Button>
        </div>
      </header>

      {syncMessage && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {syncMessage}
        </div>
      )}

      {/* ── Stats KPI ──────────────────────────────────── */}
      <StatsRow result={stats} isLoading={isStatsLoading} />

      {/* ── Filter Bar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <FilterIcon className="size-3.5" />
          <span>Filtrele</span>
          {activeFilters > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {activeFilters}
            </Badge>
          )}
        </div>

        <Select value={delivery} onValueChange={(v) => setDelivery(v as DeliveryFilter)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm teslimat</SelectItem>
            <SelectItem value="STORE">Kendi Kuryem</SelectItem>
            <SelectItem value="GO">Trendyol Go</SelectItem>
          </SelectContent>
        </Select>

        <Select value={hasComment} onValueChange={(v) => setHasComment(v as CommentFilter)}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm yorumlar</SelectItem>
            <SelectItem value="with">Yorumlu</SelectItem>
            <SelectItem value="without">Yorumsuz</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={answerStatus}
          onValueChange={(v) => setAnswerStatus(v as AnswerStatusFilter)}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm cevap durumları</SelectItem>
            <SelectItem value="WAITING_FOR_APPROVE">Onay Bekliyor</SelectItem>
            <SelectItem value="APPROVED">Onaylandı</SelectItem>
            <SelectItem value="REJECTED">Reddedildi</SelectItem>
          </SelectContent>
        </Select>

        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDelivery("all");
              setHasComment("all");
              setAnswerStatus("all");
            }}
            className="h-8 text-xs text-muted-foreground"
          >
            Temizle
          </Button>
        )}
      </div>

      {/* ── Liste ──────────────────────────────────────── */}
      <div
        className={`space-y-3 transition-opacity ${
          softLoading ? "opacity-60 pointer-events-none" : "opacity-100"
        }`}
        aria-busy={softLoading}
      >
        {list?.error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{list.error}</p>
          </div>
        )}

        {isListLoading && !list ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : list && uniqueReviews.length > 0 ? (
          <>
            <ul className="space-y-2">
              {uniqueReviews.map((r) => (
                <li key={r.reviewId}>
                  <ReviewRow
                    review={r}
                    onClick={() => setSelectedReviewId(r.reviewId)}
                  />
                </li>
              ))}
            </ul>

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
            <CardContent className="py-12">
              <EmptyState
                icon={MessageSquare}
                text="Bu filtre için yorum bulunamadı"
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Detay Sheet ────────────────────────────────── */}
      <ReviewDetailSheet
        review={selectedReview}
        onClose={() => setSelectedReviewId(null)}
      />
    </div>
  );
}

// ─── Stats KPI Row ─────────────────────────────────────────────────

function StatsRow({
  result,
  isLoading,
}: {
  result: TrendyolReviewStatsResult | null;
  isLoading: boolean;
}) {
  if (isLoading && !result) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <ScoreCard
        label="Genel Puan"
        score={s.averageScores.overall}
        icon={Star}
        footer={`${s.ratingCount.toLocaleString("tr-TR")} oy · ${s.commentCount.toLocaleString("tr-TR")} yorum`}
      />
      <ScoreCard label="Lezzet" score={s.averageScores.flavor} icon={Smile} />
      <ScoreCard label="Servis" score={s.averageScores.service} icon={Utensils} />
      <ScoreCard label="Teslimat" score={s.averageScores.delivery} icon={Truck} />
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
  const tone = scoreTone(score);
  const colorCls = {
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  }[tone];

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="flex items-baseline gap-2">
          <p className={`text-2xl font-semibold tabular-nums ${colorCls}`}>
            {score.toFixed(2)}
          </p>
          <Stars score={score} size="xs" />
        </div>
        {footer && <p className="text-xs text-muted-foreground">{footer}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Review Row (minimal liste satırı) ─────────────────────────────

function ReviewRow({
  review,
  onClick,
}: {
  review: TrendyolReviewWithCustomer;
  onClick: () => void;
}) {
  const tone = scoreTone(review.rating.average);
  const accentCls = {
    good: "border-l-emerald-400",
    warn: "border-l-amber-400",
    bad: "border-l-rose-400",
  }[tone];

  const commentText = review.comment?.text?.trim();
  const customerName = review.customer?.customerName || "İsimsiz müşteri";
  const answerStatus = review.comment?.restaurantAnswer?.status;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full rounded-md border border-l-4 ${accentCls} bg-card text-left transition hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring/40`}
    >
      <div className="flex items-start gap-3 p-3 sm:p-4">
        {/* Skor */}
        <div className="flex shrink-0 flex-col items-center">
          <p className="text-lg font-semibold tabular-nums leading-none">
            {review.rating.average.toFixed(1)}
          </p>
          <Stars score={review.rating.average} size="xs" className="mt-1" />
        </div>

        {/* Orta: yorum + müşteri */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium">{customerName}</span>
            {review.deliveryType === "GO" && (
              <Badge variant="outline" className="text-[10px]">
                Trendyol Go
              </Badge>
            )}
            {answerStatus && (
              <AnswerStatusChip status={answerStatus} />
            )}
          </div>

          {commentText ? (
            <p className="line-clamp-2 text-sm leading-snug text-foreground/80">
              {commentText}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              Yorum yazılmamış — sadece puan verildi
            </p>
          )}
        </div>

        {/* Sağ: tarih + chevron */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
            {formatRelativeDate(review.createdDate)}
          </span>
          <ChevronRight className="size-4 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </div>
    </button>
  );
}

// ─── Detail Sheet (yan panel — tam bilgi) ──────────────────────────

function ReviewDetailSheet({
  review,
  onClose,
}: {
  review: TrendyolReviewWithCustomer | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!review} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {review && (
          <>
            <SheetHeader className="border-b p-4 sm:p-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <ScoreHero score={review.rating.average} />
                <div className="min-w-0 flex-1 space-y-1">
                  <SheetTitle className="truncate text-left text-base">
                    Değerlendirme
                  </SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-left text-xs">
                    <span className="tabular-nums">
                      #{review.orderParentId}
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>{formatDate(review.createdDate)}</span>
                  </SheetDescription>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Badge variant="outline" className="text-[10px]">
                      {review.deliveryType === "GO"
                        ? "Trendyol Go"
                        : "Kendi Kuryem"}
                    </Badge>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
              {/* Skor kırılımı */}
              <section>
                <SectionHeader title="Puan Kırılımı" />
                <div className="grid grid-cols-3 gap-2">
                  <ScoreMini
                    label="Lezzet"
                    value={review.rating.flavorScore}
                    icon={Smile}
                  />
                  <ScoreMini
                    label="Servis"
                    value={review.rating.serviceScore}
                    icon={Utensils}
                  />
                  <ScoreMini
                    label="Teslimat"
                    value={review.rating.deliveryScore}
                    icon={Truck}
                  />
                </div>
              </section>

              {/* Müşteri yorumu */}
              {review.comment?.text && (
                <section>
                  <SectionHeader title="Müşteri Yorumu" />
                  <blockquote className="rounded-md border-l-4 border-primary/60 bg-muted/30 p-4 text-sm leading-relaxed">
                    &ldquo;{review.comment.text}&rdquo;
                  </blockquote>
                </section>
              )}

              {/* Restoran cevabı */}
              {review.comment?.restaurantAnswer && (
                <section>
                  <SectionHeader title="Restoran Cevabı" />
                  <RestaurantAnswerBlock
                    answer={review.comment.restaurantAnswer}
                  />
                </section>
              )}

              {/* Müşteri profili + sipariş + zamanlama */}
              {review.customer ? (
                <>
                  <Separator />
                  <CustomerSection
                    customer={review.customer}
                    review={review}
                  />
                </>
              ) : (
                <div className="rounded-md border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                  Müşteri snapshot&apos;ı bu sipariş için bulunamadı —
                  &ldquo;Senkronla&rdquo; ile son 30 günü çekebilirsin.
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Sheet alt-bileşenleri ─────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h3>
  );
}

function ScoreHero({ score }: { score: number }) {
  const tone = scoreTone(score);
  const bg = {
    good: "bg-emerald-100 text-emerald-700",
    warn: "bg-amber-100 text-amber-700",
    bad: "bg-rose-100 text-rose-700",
  }[tone];

  return (
    <div
      className={`flex size-12 shrink-0 items-center justify-center rounded-full ${bg} sm:size-14`}
    >
      <span className="text-base font-bold tabular-nums leading-none sm:text-lg">
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function ScoreMini({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md border p-2.5">
      <Icon className="mb-1 size-3.5 text-muted-foreground" />
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold tabular-nums">{value}</span>
        <span className="text-[10px] text-muted-foreground">/5</span>
      </div>
    </div>
  );
}

function AnswerStatusChip({
  status,
}: {
  status: TrendyolReviewAnswerStatus;
}) {
  const info = ANSWER_STATUS_LABEL[status];
  const variant: "outline" | "secondary" | "destructive" =
    info.tone === "destructive"
      ? "destructive"
      : info.tone === "success"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variant} className="text-[10px]">
      {info.label}
    </Badge>
  );
}

function RestaurantAnswerBlock({
  answer,
}: {
  answer: NonNullable<
    NonNullable<TrendyolReviewWithCustomer["comment"]>["restaurantAnswer"]
  >;
}) {
  const toneCls = {
    APPROVED: "border-emerald-200 bg-emerald-50",
    WAITING_FOR_APPROVE: "border-amber-200 bg-amber-50",
    REJECTED: "border-rose-200 bg-rose-50",
  }[answer.status];

  return (
    <div className={`rounded-md border p-3 ${toneCls}`}>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium">Cevap durumu</span>
        <AnswerStatusChip status={answer.status} />
      </div>
      <p className="text-sm">{answer.text}</p>
      {answer.rejectedReason && (
        <p className="mt-2 text-xs text-rose-700">
          Red nedeni: {answer.rejectedReason.reason}
        </p>
      )}
    </div>
  );
}

// ─── Müşteri Section (sheet içinde) ────────────────────────────────

function CustomerSection({
  customer,
  review,
}: {
  customer: NonNullable<TrendyolReviewWithCustomer["customer"]>;
  review: TrendyolReview;
}) {
  const orderTs = customer.packageCreationDate ?? 0;
  const totalDeliveryMs =
    customer.packageCreationDate && customer.packageModificationDate
      ? customer.packageModificationDate - customer.packageCreationDate
      : 0;

  return (
    <>
      {/* Müşteri profili */}
      <section className="space-y-3">
        <SectionHeader title="Müşteri" />
        <div className="flex items-start gap-3 rounded-md border p-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {getInitials(customer.customerName)}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-medium leading-tight">
              {customer.customerName || "İsimsiz Müşteri"}
            </p>
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:underline"
              >
                <Phone className="size-3.5" />
                <span className="tabular-nums">{customer.phone}</span>
              </a>
            )}
            {customer.addressFull && (
              <div className="flex items-start gap-1.5 text-xs text-foreground/80">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span>{customer.addressFull}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Sipariş içeriği */}
      {customer.lines && customer.lines.length > 0 && (
        <section>
          <SectionHeader title="Sipariş İçeriği" />
          <div className="rounded-md border">
            <ul className="divide-y">
              {customer.lines.slice(0, 8).map((line, i) => (
                <li
                  key={`${line.productId ?? "x"}-${i}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {line.quantity}×
                  </span>
                  <span className="min-w-0 flex-1 truncate">{line.name}</span>
                  {line.unitSellingPrice > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {(line.unitSellingPrice * line.quantity).toLocaleString(
                        "tr-TR",
                        {
                          style: "currency",
                          currency: "TRY",
                          maximumFractionDigits: 0,
                        },
                      )}
                    </span>
                  )}
                </li>
              ))}
              {customer.lines.length > 8 && (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  +{customer.lines.length - 8} ürün daha
                </li>
              )}
            </ul>
            {customer.totalPrice > 0 && (
              <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Toplam</span>
                <span className="font-semibold tabular-nums">
                  {customer.totalPrice.toLocaleString("tr-TR", {
                    style: "currency",
                    currency: "TRY",
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Zamanlama metrikleri */}
      <section>
        <SectionHeader title="Zamanlama" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <TimelineMetric
            icon={Calendar}
            label="Sipariş"
            value={orderTs ? formatDateOnly(orderTs) : "—"}
            sub={orderTs ? formatTimeOnly(orderTs) : ""}
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
          />
          <TimelineMetric
            icon={Truck}
            label="Teslimat"
            value={totalDeliveryMs > 0 ? formatDuration(totalDeliveryMs) : "—"}
            sub={totalDeliveryMs > 0 ? "Toplam" : ""}
          />
          <TimelineMetric
            icon={Clock}
            label="Yorum"
            value={reviewDelayLabel(orderTs, review.createdDate)}
            sub="Sipariş sonrası"
          />
        </div>
      </section>

    </>
  );
}

function TimelineMetric({
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
    <div className="min-w-0 rounded-md border bg-card p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      {sub && (
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
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
  if (totalCount === 0) return null;
  const from = page * size + 1;
  const to = Math.min(totalCount, (page + 1) * size);
  const canPrev = page > 0 && !disabled;
  const canNext = totalPages > 0 ? page + 1 < totalPages && !disabled : false;

  return (
    <div className="flex items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to}{" "}
        <span className="text-muted-foreground/70">
          / {totalCount.toLocaleString("tr-TR")}
        </span>
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onPrev}
          disabled={!canPrev}
          className="h-8 gap-1 px-2"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Önceki</span>
        </Button>
        <span className="px-2 tabular-nums">
          {page + 1}
          {totalPages > 0 && (
            <span className="text-muted-foreground/70"> / {totalPages}</span>
          )}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onNext}
          disabled={!canNext}
          className="h-8 gap-1 px-2"
        >
          <span className="hidden sm:inline">Sonraki</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Stars (compact) ───────────────────────────────────────────────

function Stars({
  score,
  size = "sm",
  className = "",
}: {
  score: number;
  size?: "xs" | "sm";
  className?: string;
}) {
  const sizeCls = size === "xs" ? "size-3" : "size-3.5";
  const full = Math.floor(score);
  const hasHalf = score - full >= 0.5;
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`${score} / 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = i < full || (i === full && hasHalf);
        return (
          <Star
            key={i}
            className={`${sizeCls} ${
              filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
            }`}
          />
        );
      })}
    </span>
  );
}

