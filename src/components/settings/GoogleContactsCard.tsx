"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  disconnectGoogleContacts,
  getGoogleContactsStatus,
  saveGoogleContactsClient,
  type GoogleContactsStatus,
} from "@/actions/settings";
import { syncCustomersToGoogleContacts } from "@/actions/customers";
import { GoogleContactsHistorySheet } from "@/components/settings/GoogleContactsHistorySheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  BookUser,
  Check,
  CloudUpload,
  Copy,
  History,
  ListChecks,
  Loader2,
  LogIn,
  Unplug,
} from "lucide-react";

const CALLBACK_PATH = "/api/google-contacts/callback";

// Senkron sonucunu tek satır metne çevirir (toast ve "Son gönderim" için).
function describeStats(r: {
  created: number;
  updated?: number;
  completed?: number;
  skipped: number;
  duplicates?: number;
}): string {
  const parts = [`${r.created} eklendi`, `${r.updated ?? 0} düzeltildi`];
  if (r.completed) parts.push(`${r.completed} kişinin eksik adres/notu tamamlandı`);
  if (r.skipped) parts.push(`${r.skipped} kişi zaten tamamdı`);
  if (r.duplicates) parts.push(`${r.duplicates} çift kayıt var`);
  return parts.join(", ");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Müşterileri Google Kişiler'e (telefon rehberi) otomatik yazma bağlantısı.
// Kurulum: Client ID/Secret gir → "Google ile Bağlan" → izin verilen hesap
// rehberin sahibi olur. Bağlandıktan sonra yeni müşteriler kendiliğinden gider.
export function GoogleContactsCard() {
  const [status, setStatus] = useState<GoogleContactsStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"new" | "all" | "disconnect" | null>(null);
  const [showClient, setShowClient] = useState(false);
  const [origin, setOrigin] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    const s = await getGoogleContactsStatus();
    setStatus(s);
    setClientId(s.clientId);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
    // Google izin sayfasından dönüş (?google=connected|error&msg=...)
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (!g) return;
    if (g === "connected") toast.success("Google Kişiler bağlandı");
    else if (g === "missing-client") toast.error("Önce Client ID ve Secret'ı kaydedin");
    else toast.error("Google'a bağlanılamadı", { description: params.get("msg") ?? undefined });
    window.history.replaceState(null, "", window.location.pathname);
  }, [load]);

  const redirectUri = `${origin}${CALLBACK_PATH}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      toast.success("Adres kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  };

  const handleSaveClient = async () => {
    setSaving(true);
    const res = await saveGoogleContactsClient({ clientId, clientSecret });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Kaydedilemedi");
      return;
    }
    toast.success("Kaydedildi — şimdi Google ile bağlanın");
    setClientSecret("");
    setShowClient(false);
    await load();
  };

  const handleSync = async (mode: "new" | "all") => {
    setBusy(mode);
    try {
      const res = await syncCustomersToGoogleContacts(mode);
      if (res.ok) {
        if (res.created === 0 && res.updated === 0 && res.completed === 0) {
          toast.info("Rehber güncel", { description: describeStats(res) });
        } else {
          toast.success("Rehber güncellendi", { description: describeStats(res) });
        }
        if (res.duplicates) {
          toast.info("Çift kayıtlar var", {
            description:
              "Google Kişiler → \"Birleştir ve düzelt\" ile tek tıkla birleştirebilirsiniz.",
          });
        }
      } else if (res.reason === "not-configured") {
        toast.error("Google Kişiler bağlı değil");
      } else {
        toast.error("Gönderilemedi", { description: res.error });
      }
    } catch {
      toast.error("Gönderilemedi");
    } finally {
      setBusy(null);
      await load();
    }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    await disconnectGoogleContacts();
    setBusy(null);
    toast.success("Bağlantı kesildi");
    await load();
  };

  const connected = status?.connected ?? false;
  const clientReady = Boolean(status?.clientId && status.hasSecret);
  const clientFormOpen = !clientReady || showClient;

  return (
    <section className="mb-8">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <BookUser className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Google Kişiler</p>
              <p className="truncate text-xs text-muted-foreground">
                {!status
                  ? "Yükleniyor…"
                  : connected
                    ? `Bağlı: ${status.email ?? "Google hesabı"} — yeni müşteriler otomatik eklenir`
                    : "Bağlı değil — müşteriler telefon rehberine elle (CSV) aktarılıyor"}
              </p>
            </div>
          </div>

          {connected && status && (
            <div className="space-y-3">
              {status.lastSync && (
                <p
                  className={
                    "rounded-lg px-3 py-2 text-xs " +
                    (status.lastSync.error
                      ? "bg-red-50 text-red-700"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  Son gönderim {formatDateTime(status.lastSync.at)}:{" "}
                  {status.lastSync.error
                    ? status.lastSync.error
                    : describeStats(status.lastSync)}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  onClick={() => void handleSync("new")}
                  disabled={busy !== null}
                >
                  {busy === "new" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CloudUpload className="h-4 w-4" />
                  )}
                  Yenileri Gönder
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleSync("all")}
                  disabled={busy !== null}
                  title="Tüm müşterileri kontrol eder: eksikleri ekler, eski/bozuk kayıtları düzeltir"
                >
                  {busy === "all" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ListChecks className="h-4 w-4" />
                  )}
                  Rehberi Düzelt
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                &quot;Rehberi Düzelt&quot; tüm müşterileri tarar: rehberde
                olmayanı ekler; &quot;Paket Servis&quot; ya da CSV
                &quot;içe aktarıldı&quot; etiketli eski kayıtların ismini,
                adresini ve notunu güncel bilgiyle düzeltir. Elle eklediğiniz
                kişilerde yalnız boş alanlar (adres, not) doldurulur; yazdığınız
                isim ve bilgiler asla değiştirilmez.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryOpen(true)}
                >
                  <History className="h-4 w-4" />
                  Gönderim Geçmişi
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDisconnect()}
                  disabled={busy !== null}
                >
                  <Unplug className="h-4 w-4" />
                  Bağlantıyı Kes
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <a href="/api/google-contacts/connect">
                    <LogIn className="h-4 w-4" />
                    Başka hesapla bağlan
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowClient((v) => !v)}
                >
                  İstemci bilgileri
                </Button>
              </div>
            </div>
          )}

          {status && !connected && (
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                <a
                  href="https://console.cloud.google.com/apis/library/people.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Google Cloud
                </a>
                &apos;da bir proje açıp <b>People API</b>&apos;yi etkinleştirin.
              </li>
              <li>
                <b>OAuth consent screen</b>: External seçin, sonra{" "}
                <b>Publish app</b> deyin (yapılmazsa bağlantı 7 günde düşer).
              </li>
              <li>
                <b>Credentials → OAuth client ID</b>, tür{" "}
                <b>Web application</b>. &quot;Authorized redirect URIs&quot;e
                aşağıdaki adresi ekleyin.
              </li>
              <li>Çıkan Client ID ve Secret&apos;ı buraya girip kaydedin.</li>
              <li>
                <b>Google ile Bağlan</b>&apos;a basın, rehberin olduğu hesabı
                seçin. &quot;Doğrulanmamış uygulama&quot; uyarısında Gelişmiş →
                Devam et.
              </li>
            </ol>
          )}

          {status && clientFormOpen && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-xs">{redirectUri}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => void handleCopy()}
                  aria-label="Yönlendirme adresini kopyala"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Client ID (…apps.googleusercontent.com)"
                className="font-mono text-xs"
              />
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={
                  status.hasSecret ? "Client Secret (kayıtlı — değiştirmek için girin)" : "Client Secret"
                }
                className="font-mono text-xs"
                autoComplete="off"
              />
              <Button
                variant={clientReady ? "outline" : "default"}
                onClick={() => void handleSaveClient()}
                disabled={saving || !clientId.trim()}
                className="w-full"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Kaydet
              </Button>
            </div>
          )}

          {status && !connected && (
            <Button
              asChild={clientReady}
              disabled={!clientReady}
              className="mt-2 w-full"
            >
              {clientReady ? (
                <a href="/api/google-contacts/connect">
                  <LogIn className="h-4 w-4" />
                  Google ile Bağlan
                </a>
              ) : (
                <span>
                  <LogIn className="h-4 w-4" />
                  Google ile Bağlan
                </span>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
      <GoogleContactsHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </section>
  );
}
