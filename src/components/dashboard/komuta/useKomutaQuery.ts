"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import type { KomutaQuery } from "@/app/api/komuta/[query]/route";

// Komuta Merkezi veri katmanı (istemci). /api/komuta/<sorgu> üzerinden paralel
// çeker ve sonucu sayfa boyunca hafızada tutar:
//  - Aynı sorgu + parametre tekrar istenirse önce eldeki veri anında gösterilir,
//    30 sn'den eskiyse arkada tazelenir (Genel Bakış ⇄ Performans ⇄ Müşteri
//    geçişleri beklemesiz).
//  - Aynı anda gelen aynı istekler tek isteğe iner.
//  - Hata → 1 sn sonra bir kez daha denenir; yine olmazsa hata işaretlenir,
//    çerçeve (KomutaShell) "Tekrar dene" gösterir. Sonsuz iskelet kalmaz.

const FRESH_MS = 30_000;
const RETRY_DELAY_MS = 1_000;

interface Entry {
  data?: unknown;
  at: number;
  inflight: boolean;
  error?: string;
}

const store = new Map<string, Entry>();
const requests = new Map<string, { query: KomutaQuery; args: unknown[] }>();
const mounted = new Map<string, number>();
const listeners = new Set<() => void>();
let lastSuccessAt: number | null = null;

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function set(key: string, patch: Partial<Entry>) {
  store.set(key, { at: 0, inflight: false, ...store.get(key), ...patch });
  emit();
}

async function request(query: KomutaQuery, args: unknown[]): Promise<unknown> {
  const res = await fetch(`/api/komuta/${query}?args=${encodeURIComponent(JSON.stringify(args))}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function load(key: string, force: boolean) {
  const e = store.get(key);
  const req = requests.get(key);
  if (!req || e?.inflight) return;
  if (!force && e?.data !== undefined && !e.error && Date.now() - e.at < FRESH_MS) return;

  set(key, { inflight: true, error: undefined });
  const attempt = (n: number): Promise<void> =>
    request(req.query, req.args).then(
      (data) => {
        lastSuccessAt = Date.now();
        set(key, { data, at: lastSuccessAt, inflight: false, error: undefined });
      },
      (err: unknown) => {
        if (n === 0) return new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS)).then(() => attempt(1));
        set(key, { inflight: false, error: err instanceof Error ? err.message : "Veri alınamadı" });
      },
    );
  void attempt(0);
}

export function useKomutaQuery<T>(
  query: KomutaQuery,
  args: unknown[],
  opts: { refreshKey?: number | string; enabled?: boolean } = {},
): { data: T | null; isLoading: boolean; isFetching: boolean; error: string | null } {
  const { refreshKey = 0, enabled = true } = opts;
  const key = `${query}:${JSON.stringify(args)}`;

  const entry = useSyncExternalStore(
    subscribe,
    () => store.get(key),
    () => undefined,
  );

  // Yenile (refreshKey değişimi) → eldeki veriyi göstermeye devam ederek zorla çek.
  const lastRefresh = useRef(refreshKey);
  useEffect(() => {
    if (!enabled) return;
    if (!requests.has(key)) requests.set(key, { query, args });
    const force = lastRefresh.current !== refreshKey;
    lastRefresh.current = refreshKey;
    load(key, force);
    // query + args zaten key'in içinde; dizi her render'da yeni olduğundan key'e bağlı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshKey, enabled]);

  // Ekrandaki sorgular — hata uyarısı ve "tekrar dene" yalnız bunlar için.
  useEffect(() => {
    if (!enabled) return;
    mounted.set(key, (mounted.get(key) ?? 0) + 1);
    emit();
    return () => {
      const n = (mounted.get(key) ?? 1) - 1;
      if (n <= 0) mounted.delete(key);
      else mounted.set(key, n);
      emit();
    };
  }, [key, enabled]);

  return {
    data: (entry?.data as T | undefined) ?? null,
    isLoading: entry?.data === undefined && !entry?.error,
    isFetching: !!entry?.inflight,
    error: entry?.error ?? null,
  };
}

// ─── Çerçeve (KomutaShell) için özet durum ───
export interface KomutaQueryStatus {
  busy: boolean;
  failed: number;
  lastSuccessAt: number | null;
}

let statusCache: KomutaQueryStatus = { busy: false, failed: 0, lastSuccessAt: null };

function readStatus(): KomutaQueryStatus {
  let busy = false;
  let failed = 0;
  for (const key of mounted.keys()) {
    const e = store.get(key);
    if (e?.inflight) busy = true;
    if (e?.error) failed++;
  }
  const s = statusCache;
  if (s.busy !== busy || s.failed !== failed || s.lastSuccessAt !== lastSuccessAt) {
    statusCache = { busy, failed, lastSuccessAt };
  }
  return statusCache;
}

export function useKomutaQueryStatus(): KomutaQueryStatus {
  return useSyncExternalStore(subscribe, readStatus, () => statusCache);
}

/** Ekrandaki hatalı sorguları yeniden dener. */
export function retryFailedKomutaQueries() {
  for (const key of mounted.keys()) {
    if (store.get(key)?.error) load(key, true);
  }
}
