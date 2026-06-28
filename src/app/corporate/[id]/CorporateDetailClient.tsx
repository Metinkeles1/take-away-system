"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getVouchersByCorporate,
  getPeriodStats,
  deleteVoucher,
  markVoucherPaid,
  markPeriodPaid,
  collectAmount,
  setVoucherPaidAmount,
  getVoucherPayments,
  markVouchersPaid,
  deleteVouchers,
  getOpenVouchersByCorporate,
} from "@/actions/vouchers";
import {
  type Corporate,
  type Payment,
  type PaymentSource,
  type Voucher,
  type PeriodStats,
} from "@/types";
import { cn, formatCurrency, formatPhone } from "@/lib/utils";

function paymentSourceLabel(source: PaymentSource): string {
  switch (source) {
    case "manual_toggle":
      return "Tek tık";
    case "manual_edit":
      return "Düzenleme";
    case "collect":
      return "Tutar tahsilat";
    case "period_paid":
      return "Tüm ay";
  }
}
import { formatPeriodLabel, ALL_OPEN_PERIOD } from "@/lib/period";
import VoucherReceipt from "@/components/receipt/VoucherReceipt";
import MonthlyStatement from "@/components/receipt/MonthlyStatement";
import ProductSummaryReceipt from "@/components/receipt/ProductSummaryReceipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Building2,
  Phone,
  Plus,
  Printer,
  Wallet,
  FileText,
  CheckCircle2,
  Receipt,
  HandCoins,
  ListChecks,
  X,
  Trash2,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "@/components/corporate/detail/StatCard";
import { VoucherList } from "@/components/corporate/detail/VoucherList";
import { PerPersonVoucherDialog } from "@/components/corporate/detail/PerPersonVoucherDialog";
import { PrintReceiptDialog } from "@/components/corporate/detail/PrintReceiptDialog";
import { STATEMENT_SCOPE_DEFS } from "@/components/receipt/corporateReceiptKit";

export default function CorporateDetailClient({
  corporate,
  initialPeriod,
  availablePeriods,
  initialVouchers,
  initialStats,
}: {
  corporate: Corporate;
  initialPeriod: string;
  availablePeriods: string[];
  initialVouchers: Voucher[];
  initialStats: PeriodStats;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [periods, setPeriods] = useState<string[]>(availablePeriods);
  const [vouchers, setVouchers] = useState<Voucher[]>(initialVouchers);
  const [stats, setStats] = useState<PeriodStats>(initialStats);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Server zaten initialPeriod için veri gönderdi — ilk effect'te tekrar fetch
  // etmeyelim; sadece kullanıcı period değiştirdiğinde load çağrılır.
  const isFirstRunRef = useRef(true);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPerPerson, setEditingPerPerson] = useState<Voucher | null>(null);
  const [deleting, setDeleting] = useState<Voucher | null>(null);
  const [confirmingPeriodPaid, setConfirmingPeriodPaid] = useState(false);
  const [printingVoucher, setPrintingVoucher] = useState<Voucher | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const [showProductSummary, setShowProductSummary] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectInput, setCollectInput] = useState("");
  const [collectSubmitting, setCollectSubmitting] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Voucher | null>(null);
  const [paymentInput, setPaymentInput] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);

  const isAllOpen = period === ALL_OPEN_PERIOD;

  const load = useCallback(async () => {
    // Refetch sırasında eski veri ekranda kalır, sadece "refreshing" göstergesi yanar.
    setIsRefreshing(true);
    try {
      if (period === ALL_OPEN_PERIOD) {
        // Tüm dönemlerdeki açık fişler + onlardan hesaplanan özet.
        const vs = await getOpenVouchersByCorporate(corporate.id);
        const total = vs.reduce((s, v) => s + v.total, 0);
        const paid = vs.reduce((s, v) => s + v.paidAmount, 0);
        setVouchers(vs);
        setStats({ count: vs.length, total, paid, unpaid: total - paid });
      } else {
        const [vs, st] = await Promise.all([
          getVouchersByCorporate(corporate.id, { period }),
          getPeriodStats(corporate.id, period),
        ]);
        setVouchers(vs);
        setStats(st);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [corporate.id, period]);

  // İlk render server verisini kullanır; period değişince yeniden çekeriz.
  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    load();
  }, [load]);

  const handleAddSuccess = useCallback(() => {
    if (!periods.includes(period)) {
      setPeriods((p) => [period, ...p]);
    }
    load();
  }, [load, period, periods]);

  const handleTogglePaid = useCallback(
    async (v: Voucher) => {
      await markVoucherPaid(v.id, !v.paid);
      toast.success(v.paid ? "Tahsilat geri alındı" : "Tahsil edildi olarak işaretlendi");
      load();
    },
    [load],
  );

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    await deleteVoucher(deleting.id);
    toast.success(`Fiş #${deleting.voucherNumber} silindi`);
    setDeleting(null);
    load();
  }, [deleting, load]);

  const handleEdit = useCallback(
    (v: Voucher) => {
      if (v.paid) {
        toast.info("Tahsil edilmiş fiş düzenlenemez");
        return;
      }
      if (v.billingType === "per_item") {
        router.push(`/corporate/${corporate.id}/voucher/${v.id}/edit`);
      } else {
        setEditingPerPerson(v);
      }
    },
    [corporate.id, router],
  );

  const openCollectDialog = useCallback(() => {
    setCollectInput("");
    setCollectOpen(true);
  }, []);

  const handleCollectAmount = useCallback(async () => {
    const normalized = collectInput.replace(",", ".").trim();
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    if (amount > stats.unpaid + 0.005) {
      toast.error(`Açık bakiyeden fazla giremezsiniz (${formatCurrency(stats.unpaid)})`);
      return;
    }
    setCollectSubmitting(true);
    try {
      const result = await collectAmount(corporate.id, period, amount);
      const closedPart =
        result.vouchersClosed > 0 ? ` · ${result.vouchersClosed} fiş kapatıldı` : "";
      toast.success(`${formatCurrency(result.applied)} tahsil edildi${closedPart}`);
      setCollectOpen(false);
      load();
    } finally {
      setCollectSubmitting(false);
    }
  }, [collectInput, corporate.id, period, stats.unpaid, load]);

  const openEditPayment = useCallback((v: Voucher) => {
    setEditingPayment(v);
    setPaymentInput(String(v.paidAmount));
    setPaymentHistory([]);
  }, []);

  // Tahsilatı düzenle dialog'u açıldığında ilgili fişin geçmişini çek.
  useEffect(() => {
    if (!editingPayment) return;
    let cancelled = false;
    setHistoryLoading(true);
    getVoucherPayments(editingPayment.id)
      .then((rows) => {
        if (!cancelled) setPaymentHistory(rows);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editingPayment]);

  const handleSavePayment = useCallback(async () => {
    if (!editingPayment) return;
    const normalized = paymentInput.replace(",", ".").trim();
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    if (amount > editingPayment.total + 0.005) {
      toast.error(`Fiş toplamı ${formatCurrency(editingPayment.total)} TL'den fazla giremezsiniz`);
      return;
    }
    setPaymentSubmitting(true);
    try {
      const result = await setVoucherPaidAmount(editingPayment.id, amount);
      if (!result.ok) {
        toast.error(result.error ?? "Tahsilat güncellenemedi");
        return;
      }
      toast.success(`#${editingPayment.voucherNumber} tahsilatı güncellendi`);
      setEditingPayment(null);
      load();
    } finally {
      setPaymentSubmitting(false);
    }
  }, [editingPayment, paymentInput, load]);

  // ── Bulk seçim ───────────────────────────────────────────────────────────
  const toggleSelect = useCallback((v: Voucher) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(v.id)) next.delete(v.id);
      else next.add(v.id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(vouchers.map((v) => v.id)));
  }, [vouchers]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkMarkPaid = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const result = await markVouchersPaid(ids, true);
    toast.success(`${result.updated} fiş tahsil edildi olarak işaretlendi`);
    exitBulkMode();
    load();
  }, [selectedIds, load, exitBulkMode]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const result = await deleteVouchers(ids);
    toast.success(`${result.deleted} fiş silindi`);
    setBulkConfirmDelete(false);
    exitBulkMode();
    load();
  }, [selectedIds, load, exitBulkMode]);

  const handleMarkPeriodPaid = useCallback(async () => {
    const result = await markPeriodPaid(corporate.id, period);
    setConfirmingPeriodPaid(false);
    if (result.updated === 0) {
      toast.info("Bu ayda açık fiş yoktu");
    } else {
      toast.success(`${result.updated} fiş tahsil edildi olarak işaretlendi`);
    }
    load();
  }, [corporate.id, period, load]);

  return (
    <main className="h-full flex flex-col px-4 pt-4 pb-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 shrink-0">
        <div className="min-w-0 flex-1">
          <Link
            href="/corporate"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Kurumsal Müşteriler
          </Link>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
              {corporate.name}
            </h1>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            {corporate.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {formatPhone(corporate.phone)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" />
              {corporate.billingType === "per_person" && corporate.pricePerPerson
                ? `${formatCurrency(corporate.pricePerPerson)} / kişi`
                : "Menüden seçim"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="flex-1 sm:flex-none sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OPEN_PERIOD}>
                Tüm Açık Hesap
              </SelectItem>
              {periods.map((p) => (
                <SelectItem key={p} value={p}>
                  {formatPeriodLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {corporate.billingType === "per_item" ? (
            <Link href={`/corporate/${corporate.id}/voucher/new`}>
              <Button>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Yeni Fiş</span>
              </Button>
            </Link>
          ) : (
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Yeni Fiş</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 shrink-0">
        <StatCard icon={FileText} label="Fiş Sayısı" value={String(stats.count)} />
        <StatCard
          icon={Wallet}
          label="Toplam"
          value={formatCurrency(stats.total)}
          tone="cyan"
        />
        <StatCard
          icon={CheckCircle2}
          label="Tahsil Edilen"
          value={formatCurrency(stats.paid)}
          tone="emerald"
        />
        <StatCard
          icon={Receipt}
          label="Açık Bakiye"
          value={formatCurrency(stats.unpaid)}
          tone={stats.unpaid > 0 ? "amber" : "default"}
        />
      </div>

      {/* Action bar */}
      {bulkMode ? (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mb-3 shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/5 px-3 py-2">
          <p className="text-sm font-medium inline-flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            {selectedIds.size} / {vouchers.length} seçili
          </p>
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={
                selectedIds.size === vouchers.length ? clearSelection : selectAll
              }
              disabled={vouchers.length === 0}
            >
              {selectedIds.size === vouchers.length ? "Temizle" : "Hepsini Seç"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleBulkMarkPaid}
              className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
            >
              <CheckCircle2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Tahsil Et</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkConfirmDelete(true)}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sil</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={exitBulkMode} aria-label="Çık">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mb-3 shrink-0">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-2 order-1">
            {isAllOpen ? formatPeriodLabel(period) : `${formatPeriodLabel(period)} dönemi`}
            {isRefreshing && (
              <span className="inline-block size-1.5 rounded-full bg-cyan-500 animate-pulse" />
            )}
          </p>
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto order-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBulkMode(true)}
              disabled={vouchers.length === 0}
              title="Toplu Seç"
            >
              <ListChecks className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Toplu Seç</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStatement(true)}
              title="Aylık Ekstre"
            >
              <Printer className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Aylık Ekstre</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProductSummary(true)}
              title="Ürün Özeti"
            >
              <Package className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Ürün Özeti</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={stats.unpaid === 0 || isAllOpen}
              onClick={openCollectDialog}
              className="border-cyan-500/40 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/10"
              title={
                isAllOpen
                  ? "Tutar tahsilatı için bir ay seçin"
                  : "Tutar Tahsil Et"
              }
            >
              <HandCoins className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Tutar Tahsil Et</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={stats.unpaid === 0 || isAllOpen}
              onClick={() => setConfirmingPeriodPaid(true)}
              className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
              title={
                isAllOpen ? "Toplu tahsilat için bir ay seçin" : "Tüm Ayı Tahsil Et"
              }
            >
              <CheckCircle2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Tüm Ayı Tahsil Et</span>
            </Button>
          </div>
        </div>
      )}

      {/* Voucher list */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        <VoucherList
          isLoading={false}
          vouchers={vouchers}
          period={period}
          onTogglePaid={handleTogglePaid}
          onDelete={setDeleting}
          onPrint={setPrintingVoucher}
          onEdit={handleEdit}
          onEditPayment={openEditPayment}
          bulkMode={bulkMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      </div>

      {/* Dialogs */}
      <PerPersonVoucherDialog
        corporate={corporate}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={handleAddSuccess}
      />
      <PerPersonVoucherDialog
        corporate={corporate}
        open={!!editingPerPerson}
        onOpenChange={(o) => !o && setEditingPerPerson(null)}
        onSuccess={load}
        editing={editingPerPerson}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fişi Sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>#{deleting?.voucherNumber}</strong> numaralı fiş silinecek (
              {deleting && formatCurrency(deleting.total)}). Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={collectOpen} onOpenChange={setCollectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tutar Tahsil Et</DialogTitle>
            <DialogDescription>
              {formatPeriodLabel(period)} döneminde açık bakiye{" "}
              <strong>{formatCurrency(stats.unpaid)}</strong>. Girilen tutar en eski açık
              fişten başlanarak düşülür; yetmezse son fişe kısmi yazılır.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="collect-amount" className="text-sm font-medium">
              Tahsil Edilecek Tutar (TL)
            </label>
            <Input
              id="collect-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              autoFocus
              value={collectInput}
              onChange={(e) => setCollectInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !collectSubmitting) handleCollectAmount();
              }}
              placeholder="0,00"
            />
            <button
              type="button"
              className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
              onClick={() => setCollectInput(String(stats.unpaid))}
            >
              Tümü ({formatCurrency(stats.unpaid)})
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectOpen(false)}>
              İptal
            </Button>
            <Button
              onClick={handleCollectAmount}
              disabled={collectSubmitting || !collectInput.trim()}
              className="bg-cyan-600 text-white hover:bg-cyan-700"
            >
              Tahsil Et
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingPayment}
        onOpenChange={(o) => {
          if (!o) setEditingPayment(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tahsilatı Düzenle</DialogTitle>
            <DialogDescription>
              {editingPayment && (
                <>
                  <strong>#{editingPayment.voucherNumber}</strong> · Fiş toplamı{" "}
                  <strong>{formatCurrency(editingPayment.total)}</strong>. Tahsil edilen
                  tutarı düzenleyin; toplam ile eşitse fiş otomatik kapanır.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="payment-amount" className="text-sm font-medium">
              Tahsil Edilen Tutar (TL)
            </label>
            <Input
              id="payment-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              autoFocus
              value={paymentInput}
              onChange={(e) => setPaymentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !paymentSubmitting) handleSavePayment();
              }}
              placeholder="0,00"
            />
            {editingPayment && (
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="text-cyan-600 dark:text-cyan-400 hover:underline"
                  onClick={() => setPaymentInput("0")}
                >
                  Sıfırla
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  className="text-emerald-600 dark:text-emerald-400 hover:underline"
                  onClick={() => setPaymentInput(String(editingPayment.total))}
                >
                  Tamamı ({formatCurrency(editingPayment.total)})
                </button>
              </div>
            )}

            {/* Tahsilat geçmişi */}
            <div className="pt-2 border-t mt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                Tahsilat Geçmişi
              </p>
              {historyLoading ? (
                <p className="text-xs text-muted-foreground">Yükleniyor…</p>
              ) : paymentHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Henüz tahsilat hareketi yok.
                </p>
              ) : (
                <ul className="max-h-32 overflow-y-auto space-y-1 text-xs">
                  {paymentHistory.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 py-0.5"
                    >
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {new Date(p.createdAt).toLocaleDateString("tr-TR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {paymentSourceLabel(p.source)}
                      </span>
                      <span
                        className={cn(
                          "font-medium tabular-nums shrink-0",
                          p.delta >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {p.delta >= 0 ? "+" : ""}
                        {formatCurrency(p.delta)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPayment(null)}>
              İptal
            </Button>
            <Button
              onClick={handleSavePayment}
              disabled={paymentSubmitting || paymentInput.trim() === ""}
              className="bg-cyan-600 text-white hover:bg-cyan-700"
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkConfirmDelete} onOpenChange={setBulkConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Seçili Fişleri Sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedIds.size}</strong> fiş kalıcı olarak silinecek.
              Tahsilat geçmişleri de birlikte silinir. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingPeriodPaid} onOpenChange={setConfirmingPeriodPaid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tüm Ayı Tahsil Et</AlertDialogTitle>
            <AlertDialogDescription>
              {formatPeriodLabel(period)} dönemindeki açık fişlerin tamamı (
              <strong>{formatCurrency(stats.unpaid)}</strong>) tahsil edildi olarak
              işaretlenecek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkPeriodPaid}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Tahsil Et
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PrintReceiptDialog
        open={!!printingVoucher}
        onOpenChange={(o) => !o && setPrintingVoucher(null)}
        title="Fiş Önizleme"
      >
        {printingVoucher && <VoucherReceipt voucher={printingVoucher} />}
      </PrintReceiptDialog>

      <PrintReceiptDialog
        open={showStatement}
        onOpenChange={setShowStatement}
        title={`${formatPeriodLabel(period)} Ekstresi`}
        filterable
        storageKey="receipt-opts:statement"
        optionDefs={[{ key: "itemPrices", label: "Ürün detayı" }]}
        scopeDefs={STATEMENT_SCOPE_DEFS}
      >
        {(opts) => (
          <MonthlyStatement
            corporate={corporate}
            vouchers={vouchers}
            stats={stats}
            period={period}
            options={opts}
            multiPeriod={isAllOpen}
          />
        )}
      </PrintReceiptDialog>

      <PrintReceiptDialog
        open={showProductSummary}
        onOpenChange={setShowProductSummary}
        title={`${formatPeriodLabel(period)} Ürün Özeti`}
        filterable
        storageKey="receipt-opts:product"
      >
        {(opts) => (
          <ProductSummaryReceipt
            corporate={corporate}
            vouchers={vouchers}
            stats={stats}
            period={period}
            options={opts}
          />
        )}
      </PrintReceiptDialog>
    </main>
  );
}
