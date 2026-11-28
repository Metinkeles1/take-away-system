"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Monitor, Printer, RefreshCw, Trash2, Undo2 } from "lucide-react";

import {
  forgetPrintAgentDevice,
  getPrintAgentStatus,
  requestPrintAgentTest,
  requestPrintAgentUninstall,
  updatePrintAgentDevice,
  updatePrintAgentSettings,
  type PrintAgentDeviceRow,
  type PrintAgentJobRow,
  type PrintAgentStatus,
} from "@/actions/printAgent";
import { PREP_CHOICES } from "@/lib/printAgent/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatAgo(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "az önce";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} dk önce`;
  return new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STEPS = [
  "Fiş yazıcısı bağlı bilgisayarda bu sayfayı açıp aşağıdan kurulum dosyasını indirin.",
  "Tarayıcı “zararlı olabilir” derse “Sakla”ya basın. İnen TrendyolYazici-Kurulum.bat dosyasına çift tıklayın; Windows uyarı verirse “Ek bilgi → Yine de çalıştır” deyin.",
  "“KURULUM TAMAMLANDI” yazınca pencereyi kapatın. Program görünmez çalışır, bilgisayar her açıldığında kendiliğinden başlar ve kendini günceller.",
  "Bilgisayar aşağıdaki listede belirir: yazıcısını seçip “Deneme fişi”ne basın.",
];

type Res = { ok: boolean; error?: string };
const failed: Res = { ok: false };

export function Switch({
  on,
  busy,
  label,
  onToggle,
}: {
  on: boolean;
  busy: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 " +
        (on ? "bg-orange-500" : "bg-slate-300")
      }
    >
      <span
        className={
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
          (on ? "translate-x-6" : "translate-x-1")
        }
      />
    </button>
  );
}

function JobRow({ j }: { j: PrintAgentJobRow }) {
  const time = new Date(j.at).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
  const title =
    j.kind === "test"
      ? `Deneme fişi · ${j.accountName ?? ""}`
      : `#${j.orderNumber ?? "?"}${j.accountName ? ` · ${j.accountName}` : ""}`;
  const accept =
    j.kind === "test" || j.acceptOk === null ? null : j.acceptOk ? (
      <span className="text-emerald-600">Kabul ✓</span>
    ) : (
      <span className="text-rose-600" title={j.acceptError ?? undefined}>
        Kabul ✗
      </span>
    );
  const print = j.printed ? (
    <span className="text-emerald-600" title={j.printedBy ? `${j.printedBy} bastı` : undefined}>
      Fiş ✓
    </span>
  ) : j.printError ? (
    <span className="text-rose-600" title={j.printError}>
      Fiş ✗
    </span>
  ) : null;
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{time}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {accept}
      {print}
    </li>
  );
}

function DeviceRow({
  d,
  busy,
  run,
}: {
  d: PrintAgentDeviceRow;
  busy: string | null;
  run: (key: string, fn: () => Promise<Res>, okText: string) => void;
}) {
  const k = (s: string) => `${d.deviceId}:${s}`;
  const name = d.host || "Bilgisayar";
  const printers =
    d.printerName && !d.printers.includes(d.printerName) ? [...d.printers, d.printerName] : d.printers;

  const state = d.uninstallPending
    ? d.online
      ? "Kaldırılıyor…"
      : "Açıldığında kendini kaldıracak"
    : d.online
      ? `Çalışıyor · son sinyal ${formatAgo(d.lastSeenAt!)}`
      : d.lastSeenAt
        ? `Kapalı — son sinyal ${formatAgo(d.lastSeenAt)}`
        : "Henüz sinyal yok";

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            d.uninstallPending ? "bg-amber-500" : d.online ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{state}</p>
        </div>
        {d.uninstallPending ? (
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === k("undo")}
              onClick={() =>
                run(k("undo"), () => requestPrintAgentUninstall(d.deviceId, true), "Kaldırma iptal edildi")
              }
            >
              <Undo2 className="h-4 w-4" />
              Vazgeç
            </Button>
            {!d.online && (
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600"
                disabled={busy === k("forget")}
                title="Bilgisayardan zaten silindiyse listeden kaldırır"
                onClick={() => run(k("forget"), () => forgetPrintAgentDevice(d.deviceId), "Listeden silindi")}
              >
                <Trash2 className="h-4 w-4" />
                Listeden sil
              </Button>
            )}
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-rose-600"
            disabled={busy === k("uninstall")}
            onClick={() => {
              if (
                !confirm(
                  `“${name}” bilgisayarından program kaldırılsın mı?\n\nAçıksa birkaç saniye içinde, kapalıysa ilk açılışında kendini kaldırır ve otomatik başlamaz. Tekrar kurmak için kurulum dosyasını yeniden indirmeniz gerekir.`,
                )
              )
                return;
              run(
                k("uninstall"),
                () => requestPrintAgentUninstall(d.deviceId),
                d.online ? "Birkaç saniye içinde kaldırılacak" : "Bilgisayar açılınca kaldırılacak",
              );
            }}
          >
            <Trash2 className="h-4 w-4" />
            Kaldır
          </Button>
        )}
      </div>

      {!d.uninstallPending && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {d.print ? "Bu bilgisayar fiş basar." : "Bu bilgisayar fiş basmaz."}
            </p>
            <Switch
              on={d.print}
              busy={busy === k("print")}
              label={`${name} fiş yazdırma`}
              onToggle={() =>
                run(
                  k("print"),
                  () => updatePrintAgentDevice(d.deviceId, { print: !d.print }),
                  d.print ? `${name}: fiş kapatıldı` : `${name}: fiş açıldı`,
                )
              }
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={d.printerName}
              disabled={busy === k("printer") || printers.length === 0}
              onChange={(e) =>
                run(
                  k("printer"),
                  () => updatePrintAgentDevice(d.deviceId, { printerName: e.target.value }),
                  "Yazıcı kaydedildi",
                )
              }
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
              aria-label={`${name} yazıcı`}
            >
              <option value="">
                {printers.length === 0 ? "Yazıcı listesi gelmedi" : "Otomatik (fiş yazıcısını kendisi bulur)"}
              </option>
              {printers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={!d.online || busy === k("test") || d.testPending}
              onClick={() =>
                run(k("test"), () => requestPrintAgentTest(d.deviceId), "Deneme fişi birkaç saniye içinde basılır")
              }
            >
              {busy === k("test") || d.testPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Deneme fişi
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// Kasa bilgisayarlarındaki "Trendyol Yazıcı" programı: yeni Trendyol siparişlerini
// (tüm işletmeler) otomatik kabul eder ve fişini basar. Ayar + bilgisayarlar + indirme.
export function TrendyolPrintAgentCard() {
  const [status, setStatus] = useState<PrintAgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setStatus(await getPrintAgentStatus());
    } catch (err) {
      console.warn("[print agent status]", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(true), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const run = useCallback(
    async (key: string, fn: () => Promise<Res>, okText: string) => {
      setBusy(key);
      const res = await fn().catch(() => failed);
      setBusy(null);
      if (res.ok) toast.success(okText);
      else toast.error(res.error ?? "İşlem başarısız");
      void load(true);
    },
    [load],
  );

  const s = status;
  const online = s?.devices.filter((d) => d.online && !d.uninstallPending).length ?? 0;
  const printing = s?.devices.some((d) => d.online && d.print && !d.uninstallPending) ?? false;

  return (
    <section className="mb-8">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
              <Printer className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Trendyol Otomatik Kabul ve Yazıcı</p>
              <p className="text-xs text-muted-foreground">
                Kasa bilgisayarında çalışan küçük program. Yeni Trendyol siparişlerini (tüm
                işletmeler) kendiliğinden kabul eder, fişini basar ve ses çalar. Fişin en üstünde
                siparişin geldiği işletme yazar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="self-start text-muted-foreground hover:text-foreground"
              aria-label="Durumu yenile"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Özet */}
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
            />
            <span className="min-w-0 flex-1">
              {!s
                ? "Kontrol ediliyor…"
                : s.devices.length === 0
                  ? "Henüz hiçbir bilgisayara kurulmadı."
                  : online === 0
                    ? "Açık bilgisayar yok — sipariş kabul edilmiyor, fiş basılmıyor."
                    : `${online} bilgisayar açık · ${
                        s.autoAccept ? "siparişler otomatik kabul ediliyor" : "otomatik kabul kapalı"
                      }${printing ? " · fiş basılıyor" : " · fiş basan bilgisayar yok"}`}
            </span>
          </div>

          {/* Kurulum dosyası indirildi ama hiçbir bilgisayardan sinyal gelmedi. */}
          {s && s.devices.length === 0 && s.installerAt && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">
                Kurulum dosyası indirildi ({formatAgo(s.installerAt)}) ama henüz hiçbir bilgisayar bağlanmadı.
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Dosyayı fiş yazıcısının bağlı olduğu bilgisayarda yeniden indirip çalıştırın.</li>
                <li>Pencerede “HATA” yazıyorsa altındaki açıklamayı izleyin.</li>
                <li>
                  Antivirüs engellemiş olabilir: Windows Güvenliği → Virüs ve tehdit koruması → Koruma
                  geçmişi’nden “İzin ver” deyin.
                </li>
              </ul>
            </div>
          )}

          {s && (
            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Otomatik kabul</p>
                  <p className="text-xs text-muted-foreground">
                    {s.autoAccept
                      ? "Açık — yeni sipariş gelir gelmez kabul edilir (birkaç saniye içinde). Kaç bilgisayar olursa olsun bir kez."
                      : "Kapalı — siparişleri Trendyol ekranından siz kabul edersiniz."}
                  </p>
                </div>
                <Switch
                  on={s.autoAccept}
                  busy={busy === "autoAccept"}
                  label="Otomatik kabul"
                  onToggle={() => {
                    setStatus({ ...s, autoAccept: !s.autoAccept }); // optimistic
                    void run(
                      "autoAccept",
                      () => updatePrintAgentSettings({ autoAccept: !s.autoAccept }),
                      s.autoAccept ? "Otomatik kabul kapatıldı" : "Otomatik kabul açıldı",
                    );
                  }}
                />
              </div>

              {s.autoAccept && (
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Trendyol&apos;a bildirilen hazırlık süresi
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PREP_CHOICES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={busy === "prep"}
                        onClick={() => {
                          if (m === s.prepMinutes) return;
                          setStatus({ ...s, prepMinutes: m });
                          void run("prep", () => updatePrintAgentSettings({ prepMinutes: m }), `Hazırlık süresi ${m} dk`);
                        }}
                        className={
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                          (m === s.prepMinutes
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "hover:bg-muted")
                        }
                      >
                        {m} dk
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bilgisayarlar */}
          {s && s.devices.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Kurulu bilgisayarlar ({s.devices.length})
              </p>
              <ul className="space-y-2">
                {s.devices.map((d) => (
                  <DeviceRow key={d.deviceId} d={d} busy={busy} run={(...a) => void run(...a)} />
                ))}
              </ul>
              {s.devices.filter((d) => d.print && !d.uninstallPending).length > 1 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Birden çok bilgisayar fiş basıyorsa her fiş yalnız birinden çıkar (hangisi önce alırsa).
                </p>
              )}
            </div>
          )}

          <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <Button asChild className="w-full" variant={online ? "outline" : "default"}>
            <a href="/api/print-agent/installer" download>
              <Download className="h-4 w-4" />
              {s?.devices.length ? "Başka bilgisayara kurmak için indir" : "Kurulum dosyasını indir"}
            </a>
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Dosya bu siteye bağlanma anahtarını içerir; kasa dışında kimseyle paylaşmayın.
          </p>

          {s && s.recent.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Son işler</p>
              <ul className="space-y-1.5">
                {s.recent.map((j) => (
                  <JobRow key={j.id} j={j} />
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
