"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sendClientLog } from "@/lib/clientLog";

const PROBE_TIMEOUT_MS = 5000;
const PROBE_INTERVAL_MS = 30000;

async function probeHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch("/api/healthz", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { "x-network-probe": "1" },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function NetworkHealthGuard() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [degraded, setDegraded] = useState(false);
  const [checking, setChecking] = useState(false);
  const failCountRef = useRef(0);
  const degradedRef = useRef(false);

  const show = useMemo(() => !online || degraded, [online, degraded]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      failCountRef.current = 0;
      setDegraded(false);
      degradedRef.current = false;
      sendClientLog({
        kind: "network-online",
        message: "browser online event",
        dedupeKey: "network-online",
      });
    };

    const onOffline = () => {
      setOnline(false);
      setDegraded(true);
      degradedRef.current = true;
      sendClientLog({
        kind: "network-offline",
        message: "browser offline event",
        dedupeKey: "network-offline",
      });
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const runProbe = async () => {
      setChecking(true);
      const ok = await probeHealth();
      setChecking(false);

      if (ok) {
        failCountRef.current = 0;
        setDegraded(false);
        if (degradedRef.current) {
          sendClientLog({
            kind: "network-recovered",
            message: "health probe recovered",
            dedupeKey: "network-recovered",
          });
        }
        degradedRef.current = false;
        return;
      }

      failCountRef.current += 1;
      if (failCountRef.current >= 2) {
        setDegraded(true);
        if (!degradedRef.current) {
          sendClientLog({
            kind: "healthz-fail",
            message: "health probe failed repeatedly",
            details: { consecutiveFails: failCountRef.current },
            dedupeKey: "healthz-fail-degraded",
          });
          sendClientLog({
            kind: "network-degraded",
            message: "health probe failed 2 times",
            dedupeKey: "network-degraded",
          });
        }
        degradedRef.current = true;
      }
    };

    void runProbe();
    const timer = window.setInterval(() => {
      if (!navigator.onLine) {
        setOnline(false);
        setDegraded(true);
        return;
      }
      void runProbe();
    }, PROBE_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-1200 border-b border-amber-200 bg-amber-50/95 px-3 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 text-xs text-amber-900 md:text-sm">
        <p>
          {!online
            ? "Internet baglantisi yok."
            : "Agda guvenlik filtresi veya DNS kaynakli erisim sorunu algilandi. Tekrar deneyin."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100"
          >
            Yenile
          </button>
          <span className="text-[11px] text-amber-700">
            {checking ? "kontrol ediliyor" : "ag kontrol"}
          </span>
        </div>
      </div>
    </div>
  );
}
