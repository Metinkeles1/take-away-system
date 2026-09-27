"use client";

import { useEffect, useState } from "react";
import {
  getContactSyncRunItems,
  getContactSyncRuns,
  searchContactSyncLog,
  type ContactSyncLogItem,
  type ContactSyncRun,
  type SyncTriggerLabel,
} from "@/actions/settings";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { formatPhone } from "@/lib/utils";

const TRIGGER_LABEL: Record<SyncTriggerLabel, string> = {
  "new-customer": "Yeni müşteri",
  cron: "Gece kontrolü",
  "manual-new": "Yenileri Gönder",
  "manual-all": "Rehberi Düzelt",
};

const ACTION_STYLE: Record<ContactSyncLogItem["action"], { label: string; cls: string }> = {
  created: { label: "Eklendi", cls: "bg-emerald-100 text-emerald-800" },
  updated: { label: "Düzeltildi", cls: "bg-sky-100 text-sky-800" },
  completed: { label: "Tamamlandı", cls: "bg-amber-100 text-amber-800" },
};

const FIELD_LABEL: Record<string, string> = {
  names: "isim",
  addresses: "adres",
  biographies: "not",
};

// Bir kerede gösterilen satır — Düzelt turunda 1000+ kişi olabilir.
const PAGE = 100;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "+905321112233" → "0532 111 22 33" biçimine yakın okunur hali.
function showPhone(e164: string): string {
  return formatPhone(e164.replace(/^\+90/, "0"));
}

function runSummary(r: ContactSyncRun): string {
  const parts: string[] = [];
  if (r.created) parts.push(`${r.created} eklendi`);
  if (r.updated) parts.push(`${r.updated} düzeltildi`);
  if (r.completed) parts.push(`${r.completed} tamamlandı`);
  if (r.skipped) parts.push(`${r.skipped} zaten tamamdı`);
  if (r.duplicates) parts.push(`${r.duplicates} çift kayıt`);
  return parts.join(" · ") || "Değişiklik yok";
}

function ItemRow({ item, showDate }: { item: ContactSyncLogItem; showDate?: boolean }) {
  const a = ACTION_STYLE[item.action];
  return (
    <li className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.name}</p>
        {item.previousName && (
          <p className="truncate text-xs text-muted-foreground line-through">
            {item.previousName}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {showPhone(item.phone)}
          {item.fields?.length
            ? ` · ${item.fields.map((f) => FIELD_LABEL[f] ?? f).join(", ")} eklendi`
            : ""}
        </p>
        {showDate && (
          <p className="text-xs text-muted-foreground">
            {formatDateTime(item.at)} · {TRIGGER_LABEL[item.trigger]}
          </p>
        )}
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${a.cls}`}>
        {a.label}
      </span>
    </li>
  );
}

function RunRow({ run }: { run: ContactSyncRun }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ContactSyncLogItem[] | null>(null);
  const [shown, setShown] = useState(PAGE);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !items && run.itemCount > 0) {
      setItems(await getContactSyncRunItems(run.id));
    }
  };

  return (
    <li className="rounded-lg border">
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        <span
          className={
            "mt-1.5 h-2 w-2 shrink-0 rounded-full " +
            (run.ok ? "bg-emerald-500" : "bg-red-500")
          }
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {formatDateTime(run.at)}
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
              {TRIGGER_LABEL[run.trigger]}
            </span>
          </p>
          <p
            className={
              "mt-0.5 text-xs " + (run.ok ? "text-muted-foreground" : "text-red-600")
            }
          >
            {run.ok ? runSummary(run) : run.error}
          </p>
        </div>
        {run.itemCount > 0 && (
          <ChevronDown
            className={
              "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform " +
              (open ? "rotate-180" : "")
            }
          />
        )}
      </button>
      {open && run.itemCount > 0 && (
        <div className="border-t px-3">
          {!items ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <ul className="divide-y">
                {/* Aynı numaralı kopyaların hepsi güncellenir → numara+işlem
                    tek başına benzersiz değil, sıra da anahtara girer. */}
                {items.slice(0, shown).map((it, i) => (
                  <ItemRow key={`${i}-${it.phone}-${it.action}`} item={it} />
                ))}
              </ul>
              {items.length > shown && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 w-full"
                  onClick={() => setShown((n) => n + PAGE)}
                >
                  {items.length - shown} kişi daha göster
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

// Google Kişiler gönderim geçmişi: son gönderimler (açılınca kişiler) ve
// isim/numara araması ("bu müşteri rehbere ne zaman gitti?").
export function GoogleContactsHistorySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [runs, setRuns] = useState<ContactSyncRun[] | null>(null);
  const [query, setQuery] = useState("");
  // Sonuç, ait olduğu aramayla birlikte tutulur → eski arama sonucu gösterilmez.
  const [found, setFound] = useState<{ q: string; items: ContactSyncLogItem[] } | null>(
    null,
  );
  const q = query.trim();
  const results = q.length >= 2 ? (found?.q === q ? found.items : []) : null;
  const searching = q.length >= 2 && found?.q !== q;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getContactSyncRuns().then((r) => {
      if (!cancelled) setRuns(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Yazmayı bitirince ara (300 ms).
  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const items = await searchContactSyncLog(q);
      if (!cancelled) setFound({ q, items });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Gönderim Geçmişi</SheetTitle>
          <SheetDescription>
            Google Kişiler&apos;e ne zaman kimin eklendiği / düzeltildiği. Son
            180 gün saklanır.
          </SheetDescription>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İsim veya numara ile ara…"
              className="pl-9"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {results !== null ? (
            searching ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Bu arama için gönderim kaydı yok.
              </p>
            ) : (
              <ul className="divide-y">
                {results.map((it, i) => (
                  <ItemRow key={`${it.at}-${it.phone}-${i}`} item={it} showDate />
                ))}
              </ul>
            )
          ) : !runs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Henüz gönderim kaydı yok. Kayıt tutma bu sürümle başladı; bundan
              sonraki gönderimler burada görünecek.
            </p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
