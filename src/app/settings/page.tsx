"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getCouriers,
  addCourier,
  renameCourier,
  setCourierActive,
  deleteCourier,
  type Courier,
} from "@/actions/couriers";
import {
  getMultiCourierMode,
  setMultiCourierMode,
} from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Bike,
  Plus,
  Loader2,
  Trash2,
  Check,
  X,
  Pencil,
  Power,
  Users,
} from "lucide-react";

export default function SettingsPage() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [multiMode, setMultiMode] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);

  const load = async () => {
    try {
      const [list, mode] = await Promise.all([
        getCouriers(),
        getMultiCourierMode(),
      ]);
      setCouriers(list);
      setMultiMode(mode);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMode = async () => {
    const next = !multiMode;
    setMultiMode(next); // optimistic
    setModeBusy(true);
    const res = await setMultiCourierMode(next);
    setModeBusy(false);
    if (res.ok) {
      toast.success(next ? "Çoklu kurye modu açıldı" : "Tek kurye moduna geçildi");
    } else {
      setMultiMode(!next); // geri al
      toast.error(res.error ?? "Ayar kaydedilemedi");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (name.length < 2) return;
    setAdding(true);
    const res = await addCourier(name);
    setAdding(false);
    if (res.ok) {
      setNewName("");
      toast.success(`${name} eklendi`);
      void load();
    } else {
      toast.error(res.error ?? "Eklenemedi");
    }
  };

  const handleRename = async (c: Courier) => {
    const name = editName.trim();
    if (name.length < 2 || name === c.name) {
      setEditingId(null);
      return;
    }
    setBusyId(c.id);
    const res = await renameCourier(c.id, name);
    setBusyId(null);
    setEditingId(null);
    if (res.ok) {
      toast.success("Güncellendi");
      void load();
    } else {
      toast.error(res.error ?? "Güncellenemedi");
    }
  };

  const handleToggleActive = async (c: Courier) => {
    setBusyId(c.id);
    // Optimistic
    setCouriers((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)),
    );
    const res = await setCourierActive(c.id, !c.active);
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error ?? "Güncellenemedi");
      void load();
    }
  };

  const handleDelete = async (c: Courier) => {
    if (!confirm(`${c.name} kuryesini silmek istediğine emin misin?`)) return;
    setBusyId(c.id);
    const res = await deleteCourier(c.id);
    setBusyId(null);
    if (res.ok) {
      toast.success(`${c.name} silindi`);
      setCouriers((prev) => prev.filter((x) => x.id !== c.id));
    } else {
      toast.error(res.error ?? "Silinemedi");
    }
  };

  return (
    <main className="h-full overflow-y-auto px-3 pt-4 pb-10 sm:px-4 md:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Başlık */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Ayarlar</h1>
          <p className="text-sm text-muted-foreground">
            Sistem ayarlarını buradan yönetin.
          </p>
        </div>

        {/* Çoklu kurye modu anahtarı */}
        <section className="mb-8">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                <Users className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Çoklu kurye modu</p>
                <p className="text-xs text-muted-foreground">
                  {multiMode
                    ? "Açık — kuryeler paket üstlenir, herkes kendi paketlerini görür."
                    : "Kapalı — tek kurye akışı: tüm paketler doğrudan teslimat ekranında."}
                </p>
              </div>
              {/* Switch */}
              <button
                role="switch"
                aria-checked={multiMode}
                aria-label="Çoklu kurye modu"
                disabled={modeBusy || loading}
                onClick={() => void handleToggleMode()}
                className={
                  "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 " +
                  (multiMode ? "bg-indigo-600" : "bg-slate-300")
                }
              >
                <span
                  className={
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
                    (multiMode ? "translate-x-6" : "translate-x-1")
                  }
                />
              </button>
            </CardContent>
          </Card>
        </section>

        {/* Kuryeler */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-lime-100 text-lime-700">
              <Bike className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Kuryeler</h2>
              <p className="text-xs text-muted-foreground">
                Kurye uygulamasında bu isimler arasından seçim yapılır.
              </p>
            </div>
          </div>

          {/* Yeni kurye ekle */}
          <div className="mb-4 flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
              placeholder="Kurye adı (örn. Ahmet)"
              maxLength={30}
            />
            <Button onClick={() => void handleAdd()} disabled={adding || newName.trim().length < 2}>
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Ekle
            </Button>
          </div>

          {/* Liste */}
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : couriers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <Bike className="mb-3 h-10 w-10 opacity-20" />
                <p className="text-sm font-medium">Henüz kurye eklenmedi</p>
                <p className="text-xs">Yukarıdan ilk kuryeyi ekleyin.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {couriers.map((c) => {
                const busy = busyId === c.id;
                const editing = editingId === c.id;
                return (
                  <Card
                    key={c.id}
                    className={c.active ? undefined : "opacity-60"}
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>

                      {editing ? (
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(c);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          maxLength={30}
                          className="h-8 flex-1"
                        />
                      ) : (
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.active ? "Aktif" : "Pasif"}
                          </p>
                        </div>
                      )}

                      <div className="flex shrink-0 items-center gap-1">
                        {editing ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-emerald-600"
                              disabled={busy}
                              onClick={() => void handleRename(c)}
                            >
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Yeniden adlandır"
                              onClick={() => {
                                setEditingId(c.id);
                                setEditName(c.name);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={
                                c.active
                                  ? "h-8 w-8 text-amber-600"
                                  : "h-8 w-8 text-emerald-600"
                              }
                              title={c.active ? "Pasifle" : "Aktifle"}
                              disabled={busy}
                              onClick={() => void handleToggleActive(c)}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-rose-600"
                              title="Sil"
                              disabled={busy}
                              onClick={() => void handleDelete(c)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Kuryeyi silmek geçmiş siparişlerdeki adını korur. Geçici olarak
            listeden çıkarmak için <b>Pasifle</b> yeterli.
          </p>
        </section>
      </div>
    </main>
  );
}
