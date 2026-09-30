"use client";

import { useEffect, useState } from "react";
import { HeartHandshake } from "lucide-react";
import { getWinbackHint } from "@/actions/winback";
import type { WinbackHint } from "@/lib/winback";

// Geri Kazan ile ulaşılmış müşteri sipariş veriyorsa hatırlatma: mesajda/
// telefonda verilen söz (indirim, ikram) bu siparişte uygulanmalı.
export function CustomerWinbackHint({ phone }: { phone: string }) {
  const [hint, setHint] = useState<{ phone: string; hint: WinbackHint; days: number } | null>(null);

  useEffect(() => {
    const key = phone.replace(/\D/g, "");
    if (key.length < 10) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await getWinbackHint(phone);
        if (!alive) return;
        const days = res ? Math.floor((Date.now() - new Date(res.at).getTime()) / 86_400_000) : 0;
        setHint(res ? { phone, hint: res, days } : null);
      } catch {
        // Hatırlatma opsiyonel — hata sipariş akışını bozmasın.
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [phone]);

  // Telefon değiştiyse eski müşterinin hatırlatmasını gösterme.
  if (!hint || hint.phone !== phone) return null;
  const h = hint.hint;
  const { days } = hint;
  const when = days <= 0 ? "Bugün" : days === 1 ? "Dün" : `${days} gün önce`;

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
      <div className="flex items-center gap-2 font-semibold">
        <HeartHandshake className="h-4 w-4 shrink-0" />
        Geri kazanılan müşteri
      </div>
      <p className="mt-1 text-xs">
        {when}{" "}
        {h.method === "whatsapp"
          ? `WhatsApp'tan${h.templateTitle ? ` “${h.templateTitle}”` : ""} mesajı gönderildi.`
          : "telefonla arandı."}{" "}
        Verilen teklifi (indirim/ikram) uygulamayı unutmayın.
      </p>
      {(h.message || h.note) && (
        <p className="mt-1.5 line-clamp-3 rounded-md bg-background/60 px-2 py-1 text-xs italic">
          {h.note ?? h.message}
        </p>
      )}
    </div>
  );
}
