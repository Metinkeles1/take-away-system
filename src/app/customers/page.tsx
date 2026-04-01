"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<SavedCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<SavedCustomer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<SavedCustomer | null>(null);
  const [formData, setFormData] = useState<CustomerFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

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

  // ─── Add Customer ───────────────────────────────────────────────
  const handleOpenAdd = () => {
    setFormData(emptyForm);
    setShowAddDialog(true);
  };

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
      setShowAddDialog(false);
      loadCustomers();
    } catch {
      toast.error("Müşteri eklenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Edit Customer ──────────────────────────────────────────────
  const handleOpenEdit = (customer: SavedCustomer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      addressDetail: customer.addressDetail ?? "",
    });
  };

  const handleEdit = async () => {
    if (!editingCustomer) return;
    if (!formData.name.trim() || !formData.phone.trim() || !formData.address.trim()) {
      toast.error("Ad, telefon ve adres zorunludur");
      return;
    }
    setIsSaving(true);
    try {
      await updateCustomer(editingCustomer.id, {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        addressDetail: formData.addressDetail.trim() || undefined,
      });
      toast.success("Müşteri güncellendi");
      setEditingCustomer(null);
      loadCustomers();
    } catch {
      toast.error("Müşteri güncellenirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Delete Customer ────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingCustomer) return;
    setIsSaving(true);
    try {
      await deleteCustomer(deletingCustomer.id);
      toast.success("Müşteri silindi");
      setDeletingCustomer(null);
      loadCustomers();
    } catch {
      toast.error("Müşteri silinirken hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

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
        <Button onClick={handleOpenAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Yeni Müşteri
        </Button>
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
                <Button className="mt-4" onClick={handleOpenAdd}>
                  <Plus className="mr-2 h-4 w-4" />
                  Yeni Müşteri Ekle
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {customers.map((customer) => (
              <Card key={customer.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-4">
                  {/* Avatar */}
                  <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-5 w-5" />
                  </div>

                  {/* Info */}
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

                  {/* Meta + Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="hidden sm:flex gap-1">
                      <ShoppingBag className="h-3 w-3" />
                      {customer.orderCount} sipariş
                    </Badge>
                    <span className="hidden md:block text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(customer.updatedAt)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenEdit(customer)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeletingCustomer(customer)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ─── Add Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Müşteri Ekle</DialogTitle>
          </DialogHeader>
          <CustomerFormFields formData={formData} setFormData={setFormData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              İptal
            </Button>
            <Button onClick={handleAdd} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!editingCustomer} onOpenChange={(o) => !o && setEditingCustomer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Müşteri Düzenle</DialogTitle>
          </DialogHeader>
          <CustomerFormFields formData={formData} setFormData={setFormData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCustomer(null)}>
              İptal
            </Button>
            <Button onClick={handleEdit} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ────────────────────────────────────── */}
      <AlertDialog open={!!deletingCustomer} onOpenChange={(o) => !o && setDeletingCustomer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Müşteriyi Sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deletingCustomer?.name}</strong> adlı müşteriyi silmek istediğinize emin
              misiniz? Bu işlem geri alınamaz.
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
    </main>
  );
}

// ─── Reusable form fields ──────────────────────────────────────────────────
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
