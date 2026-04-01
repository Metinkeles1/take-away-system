"use client";

import { useEffect, useState, useCallback, memo } from "react";
import {
  getSavedCustomers,
  searchCustomers,
  deleteCustomer,
  updateCustomer,
  createCustomer,
} from "@/actions/customers";
import { type SavedCustomer } from "@/types";
import { formatPhone, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  Phone,
  MapPin,
  User,
  ShoppingBag,
  Loader2,
  Download,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────
interface CustomerFormState {
  name: string;
  phone: string;
  address: string;
  addressDetail: string;
}

const emptyForm: CustomerFormState = {
  name: "",
  phone: "",
  address: "",
  addressDetail: "",
};

// ─── CustomerCard (memo) ───────────────────────────────────────────────────
// Her kart sadece kendi verisi değiştiğinde render olur.
const CustomerCard = memo(function CustomerCard({
  customer,
  onEdit,
  onDelete,
}: {
  customer: SavedCustomer;
  onEdit: (customer: SavedCustomer) => void;
  onDelete: (customer: SavedCustomer) => void;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate">{customer.name}</p>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{formatPhone(customer.phone)}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {customer.address}
              {customer.addressDetail && ` - ${customer.addressDetail}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="hidden sm:flex gap-1">
            <ShoppingBag className="h-3 w-3" />
            {customer.orderCount} sipariş
          </Badge>
          <span className="hidden md:block text-xs text-muted-foreground whitespace-nowrap">
            {formatDate(customer.updatedAt)}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(customer)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(customer)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

// ─── CustomerFormFields ────────────────────────────────────────────────────
function CustomerFormFields({
  formData,
  setFormData,
}: {
  formData: CustomerFormState;
  setFormData: React.Dispatch<React.SetStateAction<CustomerFormState>>;
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="name">Ad Soyad *</Label>
        <Input
          id="name"
          placeholder="Müşteri adı"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Telefon *</Label>
        <Input
          id="phone"
          placeholder="05XX XXX XX XX"
          value={formData.phone}
          onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="address">Adres *</Label>
        <Input
          id="address"
          placeholder="Müşteri adresi"
          value={formData.address}
          onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="addressDetail">Adres Detayı</Label>
        <Input
          id="addressDetail"
          placeholder="Daire, kat vb."
          value={formData.addressDetail}
          onChange={(e) => setFormData((p) => ({ ...p, addressDetail: e.target.value }))}
        />
      </div>
    </div>
  );
}

// ─── AddCustomerDialog ─────────────────────────────────────────────────────
// Kendi formData + isSaving state'ini taşır. Açılınca sadece bu component render olur.
const AddCustomerDialog = memo(function AddCustomerDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState<CustomerFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  // Dialog açıldığında formu sıfırla
  useEffect(() => {
    if (open) setFormData(emptyForm);
  }, [open]);

  const handleAdd = async () => {
    if (!formData.name.trim() || !formData.phone.trim() || !formData.address.trim()) {
      toast.error("Ad, telefon ve adres zorunludur");
      return;
    }
    setIsSaving(true);
    try {
      await createCustomer({
        id: crypto.randomUUID(),
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        addressDetail: formData.addressDetail.trim() || undefined,
      });
      toast.success("Müşteri eklendi");
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Müşteri eklenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Yeni Müşteri Ekle</DialogTitle>
        </DialogHeader>
        <CustomerFormFields formData={formData} setFormData={setFormData} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={handleAdd} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ekle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

// ─── EditCustomerDialog ────────────────────────────────────────────────────
// customer prop aynı zamanda open kontrolü: null ise kapalı.
const EditCustomerDialog = memo(function EditCustomerDialog({
  customer,
  onClose,
  onSuccess,
}: {
  customer: SavedCustomer | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState<CustomerFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  // Müşteri değiştiğinde formu doldur
  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        addressDetail: customer.addressDetail ?? "",
      });
    }
  }, [customer]);

  const handleEdit = async () => {
    if (!customer) return;
    if (!formData.name.trim() || !formData.phone.trim() || !formData.address.trim()) {
      toast.error("Ad, telefon ve adres zorunludur");
      return;
    }
    setIsSaving(true);
    try {
      await updateCustomer(customer.id, {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        addressDetail: formData.addressDetail.trim() || undefined,
      });
      toast.success("Müşteri güncellendi");
      onClose();
      onSuccess();
    } catch {
      toast.error("Müşteri güncellenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Müşteri Düzenle</DialogTitle>
        </DialogHeader>
        <CustomerFormFields formData={formData} setFormData={setFormData} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            İptal
          </Button>
          <Button onClick={handleEdit} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

// ─── DeleteCustomerDialog ──────────────────────────────────────────────────
const DeleteCustomerDialog = memo(function DeleteCustomerDialog({
  customer,
  onClose,
  onSuccess,
}: {
  customer: SavedCustomer | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const handleDelete = async () => {
    if (!customer) return;
    setIsSaving(true);
    try {
      await deleteCustomer(customer.id);
      toast.success("Müşteri silindi");
      onClose();
      onSuccess();
    } catch {
      toast.error("Müşteri silinirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AlertDialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Müşteriyi Sil</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{customer?.name}</strong> adlı müşteriyi silmek istediğinize emin misiniz? Bu
            işlem geri alınamaz.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>İptal</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isSaving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sil
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [customers, setCustomers] = useState<SavedCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog open state — sadece boolean/referans, form state modal içinde
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<SavedCustomer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<SavedCustomer | null>(null);

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
    async (query: string) => {
      setSearchQuery(query);
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
    },
    [loadCustomers],
  );

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Stable callback refs — child memo component'ler gereksiz render olmaz
  const handleOpenEdit = useCallback((customer: SavedCustomer) => {
    setEditingCustomer(customer);
  }, []);

  const handleOpenDelete = useCallback((customer: SavedCustomer) => {
    setDeletingCustomer(customer);
  }, []);

  const handleCloseEdit = useCallback(() => setEditingCustomer(null), []);
  const handleCloseDelete = useCallback(() => setDeletingCustomer(null), []);

  const handleExportCSV = useCallback(() => {
    if (customers.length === 0) {
      toast.error("İndirilecek müşteri bulunamadı");
      return;
    }
    const header = "Ad Soyad,Telefon,Adres,Adres Detay,Sipariş Sayısı";
    const rows = customers.map((c) => {
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      return [
        escape(c.name),
        escape(c.phone),
        escape(c.address),
        escape(c.addressDetail ?? ""),
        c.orderCount,
      ].join(",");
    });
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `musteriler_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${customers.length} müşteri CSV olarak indirildi`);
  }, [customers]);

  return (
    <main className="h-full flex flex-col container mx-auto max-w-6xl px-4 pt-4 pb-4 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Müşteriler</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Toplam {customers.length} müşteri
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            CSV İndir
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni Müşteri
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="İsim, telefon veya adres ile ara..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Customer List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="rounded-lg border p-4 flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : customers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Users className="mb-4 h-16 w-16 opacity-20" />
              <p className="text-lg font-medium">
                {searchQuery ? "Müşteri bulunamadı" : "Henüz müşteri yok"}
              </p>
              <p className="mt-1 text-sm">
                {searchQuery
                  ? "Farklı bir arama terimi deneyin"
                  : "İlk müşteriyi eklemek için butona tıklayın"}
              </p>
              {!searchQuery && (
                <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Yeni Müşteri Ekle
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {customers.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals — her biri kendi state'ini yönetir, parent'ı re-render etmez */}
      <AddCustomerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={loadCustomers}
      />
      <EditCustomerDialog
        customer={editingCustomer}
        onClose={handleCloseEdit}
        onSuccess={loadCustomers}
      />
      <DeleteCustomerDialog
        customer={deletingCustomer}
        onClose={handleCloseDelete}
        onSuccess={loadCustomers}
      />
    </main>
  );
}
