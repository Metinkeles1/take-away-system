"use client";

import { useEffect } from "react";
import { sendClientLog } from "@/lib/clientLog";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Uygulama hatasi:", error);
    sendClientLog({
      kind: "error-boundary",
      message: error.message,
      details: {
        digest: error.digest,
        stack: error.stack ? error.stack.slice(0, 1500) : undefined,
      },
    });
  }, [error]);

  return (
    <main className="min-h-dvh grid place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Sayfa gecici olarak acilamadi</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ag guvenlik filtresi veya baglanti kopmasi nedeniyle bu ekran yuklenememis olabilir.
          Interneti kontrol edip tekrar deneyin.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={reset}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Tekrar dene
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sayfayi yenile
          </button>
        </div>
      </section>
    </main>
  );
}
