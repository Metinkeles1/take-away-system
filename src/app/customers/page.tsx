"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  getCustomersForContactExport,
  getSavedCustomers,
  markCustomersContactExported,
  searchCustomers,
} from "@/actions/customers";
import { type SavedCustomer } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Download } from "lucide-react";
import { toast } from "sonner";
import { CustomerList } from "@/components/customers/CustomerList";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { DeleteCustomerDialog } from "@/components/customers/DeleteCustomerDialog";
import { CustomerHistoryDialog } from "@/components/customers/CustomerHistoryDialog";
import { exportCustomersToCsv } from "@/components/customers/customerCsv";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<SavedCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [, startSearchTransition] = useTransition();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<SavedCustomer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<SavedCustomer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<SavedCustomer | null>(null);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getSavedCustomers();
      setCustomers(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      // Input anlık güncellenir, ağır liste re-render'ı transition'a atılır
      setSearchQuery(query);
      startSearchTransition(async () => {
        if (!query.trim()) {
          loadCustomers();
          return;
        }
        setIsLoading(true);
        try {
          const data = await searchCustomers(query);
          setCustomers(data);
        } finally {
          setIsLoading(false);
        }
      });
    },
    [loadCustomers],
  );

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleOpenAdd = useCallback(() => setShowAddDialog(true), []);
  const handleOpenEdit = useCallback((c: SavedCustomer) => setEditingCustomer(c), []);
  const handleOpenDelete = useCallback((c: SavedCustomer) => setDeletingCustomer(c), []);
  const handleViewHistory = useCallback((c: SavedCustomer) => setHistoryCustomer(c), []);

  // "new": yalnız rehbere henüz aktarılmamış müşteriler (normal kullanım).
  // "all": hepsi — rehberi sıfırdan kurarken. İkisi de indirilenleri
  // "aktarıldı" işaretler; sonraki "Yeni Kişiler" onları tekrar vermez.
  const [exporting, setExporting] = useState<"new" | "all" | null>(null);
  const handleExportCSV = useCallback(async (mode: "new" | "all") => {
    setExporting(mode);
    try {
      const list = await getCustomersForContactExport(mode);
      if (list.length === 0) {
        toast.info(
          mode === "new"
            ? "Rehbere aktarılmamış yeni müşteri yok"
            : "İndirilecek müşteri bulunamadı",
        );
        return;
      }
      exportCustomersToCsv(list, mode === "new" ? "yeni_musteriler" : "tum_musteriler");
      await markCustomersContactExported(list.map((c) => c.id));
      toast.success(
        mode === "new"
          ? `${list.length} yeni müşteri indirildi`
          : `${list.length} müşteri indirildi`,
      );
    } catch {
      toast.error("CSV oluşturulamadı");
    } finally {
      setExporting(null);
    }
  }, []);

  return (
    <main className="h-full flex flex-col px-4 pt-4 pb-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Müşteriler</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Toplam {customers.length} müşteri
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handleExportCSV("new")}
            disabled={exporting !== null}
            title="Sadece telefona daha önce aktarılmamış müşteriler"
          >
            <Download className="mr-2 h-4 w-4" />
            Yeni Kişileri İndir
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleExportCSV("all")}
            disabled={exporting !== null}
            title="Tüm müşteriler — rehberi sıfırdan kurarken"
          >
            Tümü
          </Button>
          <Button onClick={handleOpenAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni Müşteri
          </Button>
        </div>
      </div>

      <div className="relative mb-4 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="İsim, telefon veya adres ile ara..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex-1 min-h-0">
        <CustomerList
          isLoading={isLoading}
          customers={customers}
          searchQuery={searchQuery}
          onEdit={handleOpenEdit}
          onDelete={handleOpenDelete}
          onViewHistory={handleViewHistory}
          onAdd={handleOpenAdd}
        />
      </div>

      <CustomerFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={loadCustomers}
      />
      <CustomerFormDialog
        editing={editingCustomer}
        open={!!editingCustomer}
        onOpenChange={(o) => !o && setEditingCustomer(null)}
        onSuccess={loadCustomers}
      />
      <DeleteCustomerDialog
        customer={deletingCustomer}
        onClose={() => setDeletingCustomer(null)}
        onSuccess={loadCustomers}
      />
      <CustomerHistoryDialog
        customer={historyCustomer}
        onClose={() => setHistoryCustomer(null)}
      />
    </main>
  );
}
