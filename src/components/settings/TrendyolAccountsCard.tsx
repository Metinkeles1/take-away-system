"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Store,
  Trash2,
  Upload,
} from "lucide-react";

import {
  deleteTrendyolAccount,
  getTrendyolAccountsState,
  importEnvTrendyolAccount,
  saveTrendyolAccount,
  setTrendyolAccountActive,
  testTrendyolAccount,
  type TrendyolAccountView,
  type TrendyolAccountsState,
} from "@/actions/trendyolAccounts";
import {
  ACCOUNT_DOT_CLASS,
  TRENDYOL_ACCOUNT_COLORS,
  accountColor,
} from "@/lib/integrations/trendyol/accountColors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface FormState {
  id?: string;
  name: string;
  supplierId: string;
  apiKey: string;
  apiSecret: string;
  storeIds: string;
  color: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  supplierId: "",
  apiKey: "",
  apiSecret: "",
  storeIds: "",
  color: "orange",
};

// Trendyol GO Yemek satıcı hesapları. Her işletme kendi Satıcı ID + API anahtarı
// ile eklenir; panel tüm aktif hesapların siparişlerini birlikte gösterir.
export function TrendyolAccountsCard() {
  const [state, setState] = useState<TrendyolAccountsState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    try {
      setState(await getTrendyolAccountsState());
    } catch {
      toast.error("Trendyol hesapları okunamadı");
    }
  };

  useEffect(() => {
    void getTrendyolAccountsState()
      .then(setState)
      .catch(() => toast.error("Trendyol hesapları okunamadı"));
  }, []);

  const openNew = () =>
    setForm({
      ...EMPTY_FORM,
      // Yeni hesaba henüz kullanılmayan bir renk öner.
      color:
        TRENDYOL_ACCOUNT_COLORS.find(
          (c) =>
            !state?.accounts.some((a) => a.color === c) &&
            // .env hesabı taşınınca turuncu olur → yeni hesaba başka renk.
            !(state?.envFallback && c === "orange"),
        ) ?? "orange",
    });

  const openEdit = (a: TrendyolAccountView) =>
    setForm({
      id: a.id,
      name: a.name,
      supplierId: a.supplierId,
      apiKey: "",
      apiSecret: "",
      storeIds: a.storeIds.join(", "),
      color: a.color,
    });

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    const res = await saveTrendyolAccount(form);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Kaydedilemedi");
      return;
    }
    if (res.warning) toast.warning(res.warning);
    else toast.success(form.id ? "Hesap güncellendi" : "Hesap eklendi ve bağlantı doğrulandı");
    setForm(null);
    void load();
  };

  const handleTest = async (a: TrendyolAccountView) => {
    setBusyId(a.id);
    const res = await testTrendyolAccount(a.id);
    setBusyId(null);
    if (res.ok) {
      toast.success(
        res.storeIds?.length
          ? `${a.name}: bağlantı tamam (${res.storeIds.length} mağaza)`
          : `${a.name}: bağlantı tamam`,
      );
    } else {
      toast.error(res.error ?? "Bağlantı başarısız");
    }
    void load();
  };

  const handleToggle = async (a: TrendyolAccountView) => {
    setBusyId(a.id);
    const res = await setTrendyolAccountActive(a.id, !a.active);
    setBusyId(null);
    if (!res.ok) toast.error(res.error ?? "Güncellenemedi");
    void load();
  };

  const handleDelete = async (a: TrendyolAccountView) => {
    if (
      !window.confirm(
        `"${a.name}" hesabı silinsin mi? Bu işletmenin siparişleri artık panele gelmez (arşivdeki eski siparişler kalır).`,
      )
    )
      return;
    setBusyId(a.id);
    const res = await deleteTrendyolAccount(a.id);
    setBusyId(null);
    if (res.ok) toast.success("Hesap silindi");
    else toast.error(res.error ?? "Silinemedi");
    void load();
  };

  const handleImport = async () => {
    const name = window.prompt("Bu işletmenin panelde görünecek adı:", "Trendyol");
    if (name === null) return;
    setImporting(true);
    const res = await importEnvTrendyolAccount(name);
    setImporting(false);
    if (res.ok) toast.success("Hesap Ayarlar'a taşındı");
    else toast.error(res.error ?? "Taşınamadı");
    void load();
  };

  const accounts = state?.accounts ?? [];

  return (
    <section className="mb-8">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
              <Store className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Trendyol hesapları</p>
              <p className="text-xs text-muted-foreground">
                Her işletmeyi kendi Satıcı ID ve API bilgileriyle ekleyin. Tüm aktif
                hesapların siparişleri panelde birlikte görünür.
              </p>
            </div>
            <Button size="sm" onClick={openNew} disabled={!state}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Hesap ekle</span>
            </Button>
          </div>

          {!state && (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {state?.envFallback && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="font-medium">
                Şu an .env dosyasındaki hesap kullanılıyor (Satıcı ID{" "}
                {state.envFallback.supplierId}).
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ayarlar&apos;a taşıyınca adını ve mağazalarını buradan düzenleyebilirsiniz.
                Taşımadan yeni işletme eklerseniz bu hesap &quot;Ana işletme&quot; adıyla
                otomatik taşınır.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void handleImport()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Ayarlar&apos;a taşı
              </Button>
            </div>
          )}

          {state && accounts.length === 0 && !state.envFallback && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Henüz Trendyol hesabı yok.
            </p>
          )}

          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "rounded-lg border p-3",
                  !a.active && "opacity-60",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                      ACCOUNT_DOT_CLASS[accountColor(a.color)],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {a.name}
                      {!a.active && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (kapalı)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Satıcı {a.supplierId} · Anahtar {a.apiKeyHint || "—"} ·{" "}
                      {a.storeIds.length > 0
                        ? `Mağaza ${a.storeIds.join(", ")}`
                        : "Mağaza: son siparişlerden bulunur"}
                    </p>
                    {a.keyBroken ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Kayıtlı anahtar okunamıyor — düzenleyip yeniden girin.
                      </p>
                    ) : a.lastTestOk === false ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {a.lastTestError || "Son bağlantı denemesi başarısız"}
                      </p>
                    ) : a.lastTestOk ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Bağlantı çalışıyor
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === a.id}
                    onClick={() => void handleTest(a)}
                  >
                    {busyId === a.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Test et
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Düzenle
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === a.id}
                    onClick={() => void handleToggle(a)}
                  >
                    {a.active ? "Kapat" : "Aç"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    disabled={busyId === a.id}
                    onClick={() => void handleDelete(a)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Sil
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={form !== null} onOpenChange={(o) => !o && !saving && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Hesabı düzenle" : "Trendyol hesabı ekle"}</DialogTitle>
            <DialogDescription>
              Bilgiler Trendyol Partner &gt; Hesap Bilgilerim &gt; Entegrasyon
              Bilgileri&apos;nde. Kaydederken bağlantı denenir.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ty-name">İşletme adı</Label>
                <Input
                  id="ty-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ör. Merkez Şube"
                  maxLength={40}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ty-supplier">Satıcı ID</Label>
                <Input
                  id="ty-supplier"
                  inputMode="numeric"
                  value={form.supplierId}
                  onChange={(e) =>
                    setForm({ ...form, supplierId: e.target.value.replace(/[^\d]/g, "") })
                  }
                  className="font-mono"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="ty-key">API anahtarı</Label>
                  <Input
                    id="ty-key"
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder={form.id ? "Değiştirmek için yazın" : ""}
                    autoComplete="off"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ty-secret">API şifresi</Label>
                  <Input
                    id="ty-secret"
                    type="password"
                    value={form.apiSecret}
                    onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                    placeholder={form.id ? "Değiştirmek için yazın" : ""}
                    autoComplete="new-password"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ty-stores">Mağaza ID&apos;leri (isteğe bağlı)</Label>
                <Input
                  id="ty-stores"
                  value={form.storeIds}
                  onChange={(e) => setForm({ ...form, storeIds: e.target.value })}
                  placeholder="Boş bırakırsanız son siparişlerden bulunur"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Birden çok şube varsa virgülle ayırın.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Renk</Label>
                <div className="flex gap-2">
                  {TRENDYOL_ACCOUNT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      aria-pressed={form.color === c}
                      onClick={() => setForm({ ...form, color: c })}
                      className={cn(
                        "h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition",
                        ACCOUNT_DOT_CLASS[c],
                        form.color === c ? "ring-2 ring-foreground" : "opacity-70",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
              Vazgeç
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
