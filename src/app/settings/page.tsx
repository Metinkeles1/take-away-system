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
  getShopLocation,
  setShopLocation,
  getShopIban,
  setShopIban,
  getMonthlyTarget,
  setMonthlyTarget,
} from "@/actions/settings";
import { LocationPicker, type LatLng } from "@/components/kurye/LocationPicker";
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
  Store,
  MapPin,
  Landmark,
  Target,
} from "lucide-react";

// Dükkan konumu hiç ayarlı değilken haritanın ortalanacağı nokta (env ile bölgeye
// göre ayarlanabilir; varsayılan İstanbul). Kurye sayfasıyla aynı varsayılan.
const DEFAULT_MAP_CENTER: LatLng = {
  lat: Number(process.env.NEXT_PUBLIC_DEFAULT_LAT) || 41.0082,
  lng: Number(process.env.NEXT_PUBLIC_DEFAULT_LNG) || 28.9784,
};

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
  // Dükkan konumu — kurye ekranında müşteriye uzaklık bundan hesaplanır.
  const [shopLoc, setShopLoc] = useState<LatLng | null>(null);
  const [shopPickerOpen, setShopPickerOpen] = useState(false);
  const [shopSaving, setShopSaving] = useState(false);
  // Dükkan IBAN'ı — kurye "IBAN" ödeme seçince müşteriye gösterilir/gönderilir.
  const [ibanName, setIbanName] = useState("");
  const [ibanNumber, setIbanNumber] = useState("");
  const [ibanSaving, setIbanSaving] = useState(false);
  // Aylık ciro hedefi — dashboard "Bu Ay" ilerleme çubuğu.
  const [targetInput, setTargetInput] = useState("");
  const [targetSaving, setTargetSaving] = useState(false);

  const load = async () => {
    try {
      const [list, mode, shop, iban, tgt] = await Promise.all([
        getCouriers(),
        getMultiCourierMode(),
        getShopLocation(),
        getShopIban(),
        getMonthlyTarget(),
      ]);
      setCouriers(list);
      setMultiMode(mode);
      setShopLoc(shop);
      if (iban) {
        setIbanName(iban.name);
        setIbanNumber(iban.iban);
      }
      if (tgt > 0) setTargetInput(String(tgt));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTarget = async () => {
    const value = Number(targetInput.replace(/[^\d]/g, ""));
    setTargetSaving(true);
    const res = await setMonthlyTarget(value);
    setTargetSaving(false);
    if (res.ok) {
      toast.success(value > 0 ? "Aylık hedef kaydedildi" : "Hedef kaldırıldı");
    } else {
      toast.error(res.error ?? "Hedef kaydedilemedi");
    }
  };

  const handleSaveIban = async () => {
    setIbanSaving(true);
    const res = await setShopIban({ name: ibanName, iban: ibanNumber });
    setIbanSaving(false);
    if (res.ok) {
      toast.success("IBAN kaydedildi");
    } else {
      toast.error(res.error ?? "IBAN kaydedilemedi");
    }
  };

  const handleSaveShopLocation = async (geo: LatLng) => {
    setShopSaving(true);
    const res = await setShopLocation({ lat: geo.lat, lng: geo.lng });
    setShopSaving(false);
    if (res.ok) {
      setShopLoc(geo);
      setShopPickerOpen(false);
      toast.success("Dükkan konumu kaydedildi");
    } else {
      toast.error(res.error ?? "Konum kaydedilemedi");
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

        {/* Dükkan konumu — kurye ekranında müşteriye uzaklık hesabı için */}
        <section className="mb-8">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Dükkan konumu</p>
                <p className="text-xs text-muted-foreground">
                  {shopLoc
                    ? `Ayarlı — kurye kartında müşteriye uzaklık gösterilir. (${shopLoc.lat.toFixed(5)}, ${shopLoc.lng.toFixed(5)})`
                    : "Ayarlı değil — haritada işaretleyince kurye kartında müşteriye kuş uçuşu uzaklık görünür."}
                </p>
              </div>
              <Button
                variant={shopLoc ? "outline" : "default"}
                size="sm"
                className="shrink-0"
                disabled={loading}
                onClick={() => setShopPickerOpen(true)}
              >
                <MapPin className="h-4 w-4" />
                {shopLoc ? "Düzelt" : "İşaretle"}
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Dükkan IBAN'ı — kurye "IBAN" ödeme seçince müşteriye gösterilir/gönderilir */}
        <section className="mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700">
                  <Landmark className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Tahsilat IBAN&apos;ı</p>
                  <p className="text-xs text-muted-foreground">
                    Kurye &quot;IBAN&quot; ödeme seçince müşteriye bu bilgiler
                    gösterilir veya WhatsApp ile gönderilir.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Input
                  value={ibanName}
                  onChange={(e) => setIbanName(e.target.value)}
                  placeholder="Ad Soyad / Ünvan"
                  maxLength={60}
                  disabled={loading}
                />
                <Input
                  value={ibanNumber}
                  onChange={(e) => setIbanNumber(e.target.value.toUpperCase())}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  maxLength={34}
                  disabled={loading}
                  className="font-mono tracking-wide"
                />
                <Button
                  onClick={() => void handleSaveIban()}
                  disabled={ibanSaving || loading || ibanName.trim().length < 2}
                  className="w-full"
                >
                  {ibanSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  IBAN&apos;ı Kaydet
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Aylık ciro hedefi — dashboard ilerleme çubuğu */}
        <section className="mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Target className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Aylık ciro hedefi</p>
                  <p className="text-xs text-muted-foreground">
                    Dashboard&apos;da &quot;Bu Ay&quot; görünümünde ilerleme
                    çubuğu olarak gösterilir. Boş/0 = gizli.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  value={targetInput}
                  onChange={(e) =>
                    setTargetInput(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="Örn. 150000"
                  maxLength={9}
                  disabled={loading}
                  className="font-mono tracking-wide"
                />
                <Button
                  onClick={() => void handleSaveTarget()}
                  disabled={targetSaving || loading}
                >
                  {targetSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Kaydet
                </Button>
              </div>
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

      {/* Dükkan konumunu haritada işaretle (kuryeyle aynı seçici) */}
      <LocationPicker
        open={shopPickerOpen}
        center={shopLoc ?? DEFAULT_MAP_CENTER}
        addressLabel="Dükkan konumu"
        saving={shopSaving}
        onConfirm={(geo) => void handleSaveShopLocation(geo)}
        onCancel={() => setShopPickerOpen(false)}
      />
    </main>
  );
}
