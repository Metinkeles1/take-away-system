"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAllCustomers,
  getCustomerDetail,
  type AllCustomerRow,
  type CustomerDetailResult,
  type CustomerSortBy,
} from "@/actions/trendyolAllCustomers";
import { forgetCustomer } from "@/actions/trendyolCustomerSnapshot";
import { forceSyncCustomers } from "@/actions/trendyolReviews";
import {
  Search,
  RefreshCw,
  DatabaseZap,
  Phone,
  MapPin,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Users,
  Star,
  Trash2,
  X,
  Receipt,
  Wallet,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency } from "@/lib/utils";
import type { TrendyolReview } from "@/lib/integrations/trendyol/client";

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  Created: "Yeni",
  Picking: "Kabul",
  Invoiced: "Hazırlandı",
  Shipped: "Yolda",
  Delivered: "Teslim",
  Cancelled: "İptal",
  UnSupplied: "Karşılanamadı",
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
  if (d <= 0) return "Bugün";
  if (d === 1) return "Dün";
  if (d < 7) return `${d} gün önce`;
  if (d < 30) return `${Math.floor(d / 7)} hafta önce`;
  const m = Math.floor(d / 30);
  return m === 1 ? "1 ay önce" : `${m} ay önce`;
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

export function AllCustomersTab() {
  const [rows, setRows] = useState<AllCustomerRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setLoading] = useState(true);
  const [isSyncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [sortBy, setSortByRaw] = useState<CustomerSortBy>("lastOrder");
  const [page, setPage] = useState(0);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Filter setter'ları aynı state update'inde page'i de sıfırlar (double-fire önle).
  const setSortBy = useCallback((v: CustomerSortBy) => {
    setSortByRaw(v);
    setPage(0);
  }, []);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllCustomers({
        search: searchDebounced,
        sortBy,
        page,
        size: PAGE_SIZE,
      });
      setRows(res.customers);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages);
      if (res.error) setError(res.error);
    } finally {
      setLoading(false);
    }
  }, [searchDebounced, sortBy, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
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
        await load();
      } else {
        setSyncMessage(`Senkron hatası: ${res.error ?? "bilinmeyen"}`);
      }
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="İsim, telefon veya ilçe ile ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-muted"
              aria-label="Aramayı temizle"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as CustomerSortBy)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lastOrder">Son sipariş</SelectItem>
              <SelectItem value="orderCount">Sipariş sayısı</SelectItem>
              <SelectItem value="totalRevenue">Toplam ciro</SelectItem>
              <SelectItem value="name">İsim (A-Z)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={handleSync}
            disabled={isSyncing}
            className="gap-1.5"
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
            onClick={load}
            disabled={isLoading}
            aria-label="Yenile"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {syncMessage && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {syncMessage}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>{error}</p>
        </div>
      )}

      {/* ── Tablo ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={Users}
                text={
                  searchDebounced
                    ? "Arama kriterine uygun müşteri yok"
                    : "Henüz müşteri snapshot'ı yok — Senkronla'ya basın"
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Müşteri</th>
                    <th className="px-4 py-3 text-left font-medium hidden md:table-cell">
                      Bölge
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Sipariş</th>
                    <th className="px-4 py-3 text-right font-medium">Toplam</th>
                    <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">
                      Son Sipariş
                    </th>
                    <th className="px-2 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <CustomerRow
                      key={r.groupKey}
                      row={r}
                      onClick={() => setSelectedKey(r.groupKey)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <div className="border-t px-4 py-3">
              <Pagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                size={PAGE_SIZE}
                onPrev={() => setPage((p) => Math.max(0, p - 1))}
                onNext={() => setPage((p) => p + 1)}
                disabled={isLoading}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <CustomerDetailSheet
        groupKey={selectedKey}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}

// ─── Customer Row ──────────────────────────────────────────────────

function CustomerRow({
  row,
  onClick,
}: {
  row: AllCustomerRow;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/50"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {getInitials(row.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{row.name}</p>
            {row.phone && (
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {row.phone}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm hidden md:table-cell">
        {row.district || row.neighborhood ? (
          <div className="min-w-0">
            <p className="truncate">{row.district || "—"}</p>
            {row.neighborhood && (
              <p className="truncate text-xs text-muted-foreground">
                {row.neighborhood}
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        <span className="font-medium">{row.orderCount}</span>
        {row.cancelledCount > 0 && (
          <span className="ml-1 text-xs text-destructive">
            ({row.cancelledCount})
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-medium tabular-nums">
        {formatCurrency(row.totalRevenue)}
      </td>
      <td className="px-4 py-3 text-right text-sm text-muted-foreground hidden sm:table-cell">
        {relativeDate(row.lastOrderAt)}
      </td>
      <td className="px-2 py-3 text-muted-foreground">
        <ChevronRight className="size-4" />
      </td>
    </tr>
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
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} <span className="text-muted-foreground/70">/ {totalCount.toLocaleString("tr-TR")}</span>
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
          {totalPages > 0 && <span className="text-muted-foreground/70"> / {totalPages}</span>}
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

// ─── Detail Sheet (yan panel) ─────────────────────────────────────

function CustomerDetailSheet({
  groupKey,
  onClose,
}: {
  groupKey: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CustomerDetailResult | null>(null);

  // Derived loading: groupKey set ama detail henüz onu eşleştirmedi.
  const isLoading = !!groupKey && (!detail || detail.groupKey !== groupKey);

  useEffect(() => {
    if (!groupKey) return;
    let cancelled = false;
    getCustomerDetail(groupKey).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [groupKey]);

  const handleForget = async () => {
    if (!detail || detail.orders.length === 0) return;
    const ok = window.confirm(
      `${detail.name || "Bu müşteri"} için kayıtlı ${detail.orders.length} siparişin yerel snapshot'ı silinecek. Trendyol'daki veri etkilenmez. Emin misin?`,
    );
    if (!ok) return;
    await Promise.all(detail.orders.map((o) => forgetCustomer(o.orderNumber)));
    onClose();
  };

  const reviewByOrder = useMemo(() => {
    const m = new Map<string, TrendyolReview>();
    if (!detail) return m;
    for (const r of detail.reviews) m.set(String(r.orderParentId), r);
    return m;
  }, [detail]);

  return (
    <Sheet open={!!groupKey} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">
        {isLoading || !detail ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {getInitials(detail.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-left">
                    {detail.name}
                  </SheetTitle>
                  <SheetDescription className="text-left">
                    {detail.orderCount} sipariş ·{" "}
                    {formatCurrency(detail.totalRevenue)}
                    {detail.reviews.length > 0 &&
                      ` · ${detail.reviews.length} yorum`}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5 p-4 sm:p-6">
              {/* İletişim */}
              <section className="space-y-2.5">
                {detail.phone ? (
                  <a
                    href={`tel:${detail.phone}`}
                    className="flex items-center gap-3 rounded-md border p-3 transition hover:bg-muted/50"
                  >
                    <Phone className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">Telefon</p>
                      <p className="font-medium tabular-nums">{detail.phone}</p>
                    </div>
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Telefon bilgisi yok
                  </p>
                )}
                {detail.addressFull && (
                  <div className="flex items-start gap-3 rounded-md border p-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">Adres</p>
                      <p className="text-sm">{detail.addressFull}</p>
                    </div>
                  </div>
                )}
              </section>

              {/* KPI */}
              <div className="grid grid-cols-3 gap-2">
                <StatBlock
                  icon={Receipt}
                  label="Sipariş"
                  value={String(detail.orderCount)}
                />
                <StatBlock
                  icon={Wallet}
                  label="Toplam"
                  value={formatCurrency(detail.totalRevenue)}
                />
                <StatBlock
                  icon={Star}
                  label="Yorum"
                  value={String(detail.reviews.length)}
                />
              </div>

              <Separator />

              {/* Sipariş Geçmişi */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Sipariş Geçmişi</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {detail.orders.length} kayıt
                  </span>
                </div>

                {detail.orders.length === 0 ? (
                  <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                    Snapshot&apos;ta sipariş yok
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detail.orders.map((o) => {
                      const review = reviewByOrder.get(o.orderNumber);
                      return (
                        <li
                          key={o.orderNumber}
                          className="rounded-md border p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium tabular-nums">
                                  #{o.orderNumber}
                                </span>
                                <StatusBadge status={o.packageStatus} />
                                {o.deliveryType === "GO" && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    Trendyol Go
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="size-3" />
                                {formatDate(o.packageCreationDate)}
                              </p>
                            </div>
                            <p className="shrink-0 text-right font-semibold tabular-nums">
                              {formatCurrency(o.totalPrice)}
                            </p>
                          </div>

                          {review && (
                            <div className="mt-3 rounded-md bg-muted/40 p-2.5">
                              <div className="mb-1 flex items-center gap-1.5 text-xs">
                                <Stars score={review.rating.average} />
                                <span className="font-medium tabular-nums">
                                  {review.rating.average.toFixed(1)}
                                </span>
                                {review.comment?.text && (
                                  <Badge
                                    variant="secondary"
                                    className="ml-auto text-[10px]"
                                  >
                                    <MessageSquare className="size-2.5" />
                                    Yorumlu
                                  </Badge>
                                )}
                              </div>
                              {review.comment?.text && (
                                <p className="text-xs leading-relaxed text-foreground/80">
                                  &ldquo;{review.comment.text}&rdquo;
                                </p>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {detail.error && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {detail.error}
                </div>
              )}

              <Separator />

              {/* KVKK silme */}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleForget}
                  className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Yerel kayıtları sil (KVKK)
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

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

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const variant: "outline" | "secondary" | "destructive" =
    status === "Cancelled" || status === "UnSupplied"
      ? "destructive"
      : status === "Delivered"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variant} className="text-[10px]">
      {label}
    </Badge>
  );
}

function Stars({ score }: { score: number }) {
  const full = Math.floor(score);
  const hasHalf = score - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = i < full || (i === full && hasHalf);
        return (
          <Star
            key={i}
            className={`size-3 ${filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
          />
        );
      })}
    </span>
  );
}
