"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type CustomerAddress } from "@/types";
import { pickDefaultAddress } from "@/lib/customers/addresses";
import {
  addCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
  getSavedCustomer,
} from "@/actions/customers";
import { Plus, Pencil, Trash2, Star, MapPin, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface CustomerAddressSectionProps {
  customerId: string;
  addresses: CustomerAddress[];
  defaultAddressId?: string;
  /** Bir adres işlemi başarıyla tamamlandığında güncel listeyi bildirir. */
  onAddressesChange: (addresses: CustomerAddress[], defaultAddressId?: string) => void;
  /** Ana liste (sayfa) de arka planda tazelensin diye — dialog kapanmaz. */
  onSynced?: () => void;
}

type AddrForm = { address: string; addressDetail: string };
const EMPTY_ADDR_FORM: AddrForm = { address: "", addressDetail: "" };

export function CustomerAddressSection({
  customerId,
  addresses,
  defaultAddressId,
  onAddressesChange,
  onSynced,
}: CustomerAddressSectionProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<AddrForm>(EMPTY_ADDR_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AddrForm>(EMPTY_ADDR_FORM);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const def = pickDefaultAddress(addresses, defaultAddressId);

  function resetRowState() {
    setIsAdding(false);
    setAddForm(EMPTY_ADDR_FORM);
    setEditingId(null);
    setEditForm(EMPTY_ADDR_FORM);
    setConfirmDeleteId(null);
  }

  async function handleAdd() {
    if (!addForm.address.trim()) {
      setSectionError("Adres boş olamaz");
      return;
    }
    setSectionError(null);
    setBusyAction("add");
    try {
      const res = await addCustomerAddress(customerId, {
        address: addForm.address.trim(),
        addressDetail: addForm.addressDetail.trim() || undefined,
      });
      if (!res.ok) {
        setSectionError(res.error);
        return;
      }
      toast.success("Adres eklendi");
      resetRowState();
      await refreshLocally();
    } finally {
      setBusyAction(null);
    }
  }

  function startEdit(a: CustomerAddress) {
    setSectionError(null);
    setConfirmDeleteId(null);
    setEditingId(a.id);
    setEditForm({ address: a.address, addressDetail: a.addressDetail ?? "" });
  }

  async function handleEditSave(addressId: string) {
    if (!editForm.address.trim()) {
      setSectionError("Adres boş olamaz");
      return;
    }
    setSectionError(null);
    setBusyAction(`edit:${addressId}`);
    try {
      const res = await updateCustomerAddress(customerId, addressId, {
        address: editForm.address.trim(),
        addressDetail: editForm.addressDetail.trim() || undefined,
      });
      if (!res.ok) {
        setSectionError(res.error);
        return;
      }
      toast.success("Adres güncellendi");
      resetRowState();
      await refreshLocally();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete(addressId: string) {
    setSectionError(null);
    setBusyAction(`delete:${addressId}`);
    try {
      const res = await deleteCustomerAddress(customerId, addressId);
      if (!res.ok) {
        setSectionError(res.error);
        return;
      }
      toast.success("Adres silindi");
      resetRowState();
      await refreshLocally();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSetDefault(addressId: string) {
    setSectionError(null);
    setBusyAction(`default:${addressId}`);
    try {
      const res = await setDefaultCustomerAddress(customerId, addressId);
      if (!res.ok) {
        setSectionError(res.error);
        return;
      }
      toast.success("Varsayılan adres güncellendi");
      await refreshLocally();
    } finally {
      setBusyAction(null);
    }
  }

  // Sunucudaki güncel listeyi (id, useCount, lastUsedAt üretimi sunucuda
  // olduğu için) sunucudan tek müşteri olarak tazeler.
  async function refreshLocally() {
    const fresh = await getSavedCustomer(customerId);
    if (fresh) onAddressesChange(fresh.addresses, fresh.defaultAddressId);
    onSynced?.();
  }

  const isBusy = busyAction !== null;

  return (
    <div className="grid gap-2 pt-3 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Adresler</Label>
        {!isAdding && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSectionError(null);
              setEditingId(null);
              setConfirmDeleteId(null);
              setIsAdding(true);
            }}
            disabled={isBusy}
          >
            <Plus className="h-3.5 w-3.5" />
            Adres ekle
          </Button>
        )}
      </div>

      {sectionError && <p className="text-xs text-destructive">{sectionError}</p>}

      <div className="space-y-2">
        {addresses.map((a) => {
          const isDefault = a.id === def?.id;
          const isEditingThis = editingId === a.id;
          const isConfirmingDelete = confirmDeleteId === a.id;

          if (isEditingThis) {
            return (
              <div key={a.id} className="rounded-md border p-2.5 space-y-2 bg-muted/30">
                <Input
                  placeholder="Adres"
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, address: e.target.value }))
                  }
                  autoFocus
                />
                <Input
                  placeholder="Daire, kat vb."
                  value={editForm.addressDetail}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, addressDetail: e.target.value }))
                  }
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetRowState}
                    disabled={isBusy}
                  >
                    <X className="h-3.5 w-3.5" />
                    Vazgeç
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleEditSave(a.id)}
                    disabled={isBusy}
                  >
                    {busyAction === `edit:${a.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Kaydet
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={a.id}
              className={cn(
                "rounded-md border p-2.5 flex items-start gap-2",
                isDefault && "border-primary/40 bg-primary/5",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium wrap-break-word">{a.address}</span>
                  {a.geo && (
                    <span title="Kurye pini var" className="shrink-0 inline-flex">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                    </span>
                  )}
                  {isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      Varsayılan
                    </Badge>
                  )}
                </div>
                {a.addressDetail && (
                  <p className="text-xs text-muted-foreground wrap-break-word">
                    {a.addressDetail}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{a.useCount} kez</p>

                {isConfirmingDelete && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-destructive">Adres silinsin mi?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      onClick={() => handleDelete(a.id)}
                      disabled={isBusy}
                    >
                      {busyAction === `delete:${a.id}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Evet, sil"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={isBusy}
                    >
                      Vazgeç
                    </Button>
                  </div>
                )}
              </div>

              {!isConfirmingDelete && (
                <div className="flex items-center gap-0.5 shrink-0">
                  {!isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      title="Varsayılan yap"
                      onClick={() => handleSetDefault(a.id)}
                      disabled={isBusy}
                    >
                      {busyAction === `default:${a.id}` ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Star />
                      )}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="Düzenle"
                    onClick={() => startEdit(a)}
                    disabled={isBusy}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    title="Sil"
                    onClick={() => {
                      setSectionError(null);
                      setConfirmDeleteId(a.id);
                    }}
                    disabled={isBusy || addresses.length <= 1}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdding && (
        <div className="rounded-md border p-2.5 space-y-2 bg-muted/30">
          <Input
            placeholder="Adres"
            value={addForm.address}
            onChange={(e) => setAddForm((p) => ({ ...p, address: e.target.value }))}
            autoFocus
          />
          <Input
            placeholder="Daire, kat vb."
            value={addForm.addressDetail}
            onChange={(e) =>
              setAddForm((p) => ({ ...p, addressDetail: e.target.value }))
            }
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetRowState}
              disabled={isBusy}
            >
              İptal
            </Button>
            <Button type="button" size="sm" onClick={handleAdd} disabled={isBusy}>
              {busyAction === "add" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Ekle
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Adres değişiklikleri mevcut siparişleri etkilemez; sonraki siparişlerde kullanılır.
      </p>
    </div>
  );
}
