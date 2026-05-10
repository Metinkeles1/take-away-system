"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getVouchersByCorporate,
  getPeriodStats,
  deleteVoucher,
  markVoucherPaid,
  markPeriodPaid,
} from "@/actions/vouchers";
import { type Corporate, type Voucher, type PeriodStats } from "@/types";
import { formatCurrency, formatPhone } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import VoucherReceipt from "@/components/receipt/VoucherReceipt";
import MonthlyStatement from "@/components/receipt/MonthlyStatement";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "./_components/StatCard";
import { VoucherList } from "./_components/VoucherList";
import { PerPersonVoucherDialog } from "./_components/PerPersonVoucherDialog";
import { PrintReceiptDialog } from "./_components/PrintReceiptDialog";

export default function CorporateDetailClient({
  corporate,
  initialPeriod,
  availablePeriods,
}: {
  corporate: Corporate;
  initialPeriod: string;
  availablePeriods: string[];
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [periods, setPeriods] = useState<string[]>(availablePeriods);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [stats, setStats] = useState<PeriodStats>({ count: 0, total: 0, paid: 0, unpaid: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPerPerson, setEditingPerPerson] = useState<Voucher | null>(null);
  const [deleting, setDeleting] = useState<Voucher | null>(null);
  const [confirmingPeriodPaid, setConfirmingPeriodPaid] = useState(false);
  const [printingVoucher, setPrintingVoucher] = useState<Voucher | null>(null);
  const [showStatement, setShowStatement] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [vs, st] = await Promise.all([
        getVouchersByCorporate(corporate.id, { period }),
        getPeriodStats(corporate.id, period),
      ]);
      setVouchers(vs);
      setStats(st);
    } finally {
      setIsLoading(false);
    }
  }, [corporate.id, period]);

  useEffect(() => {
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
      <div className="mb-4 flex items-start justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <Link
            href="/corporate"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Kurumsal Müşteriler
          </Link>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <h1 className="text-2xl font-bold tracking-tight truncate">{corporate.name}</h1>
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

        <div className="flex items-center gap-2 shrink-0">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
                <Plus className="mr-2 h-4 w-4" />
                Yeni Fiş
              </Button>
            </Link>
          ) : (
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Fiş
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
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <p className="text-xs text-muted-foreground">{formatPeriodLabel(period)} dönemi</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowStatement(true)}>
            <Printer className="mr-2 h-4 w-4" />
            Aylık Ekstre
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={stats.unpaid === 0}
            onClick={() => setConfirmingPeriodPaid(true)}
            className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Tüm Ayı Tahsil Et
          </Button>
        </div>
      </div>

      {/* Voucher list */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        <VoucherList
          isLoading={isLoading}
          vouchers={vouchers}
          period={period}
          onTogglePaid={handleTogglePaid}
          onDelete={setDeleting}
          onPrint={setPrintingVoucher}
          onEdit={handleEdit}
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
      >
        <MonthlyStatement
          corporate={corporate}
          vouchers={vouchers}
          stats={stats}
          period={period}
        />
      </PrintReceiptDialog>
    </main>
  );
}
