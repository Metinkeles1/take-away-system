"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { getCashAlertSettings, setCashAlertSettings } from "@/actions/courierCash";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Kuryedeki nakit uyarısı — Komuta "Kuryelerdeki para" kartı ve kurye ekranı
// bu eşiklere göre kırmızıya döner.
export function CashAlertCard() {
  const [amount, setAmount] = useState("");
  const [minutes, setMinutes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getCashAlertSettings()
      .then((s) => {
        setAmount(String(s.amount));
        setMinutes(String(s.minutes));
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await setCashAlertSettings({ amount: Number(amount), minutes: Number(minutes) });
    setSaving(false);
    if (res.ok) toast.success("Nakit uyarısı kaydedildi");
    else toast.error(res.error ?? "Kaydedilemedi");
  };

  return (
    <section className="mb-8">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <Wallet className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Kuryedeki nakit uyarısı</p>
              <p className="text-xs text-muted-foreground">
                Kuryedeki nakit bu tutarı geçince ya da en eski nakit bu süreden uzun
                beklerse &quot;Kuryelerdeki para&quot; kartında ve kurye ekranında uyarı çıkar.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="cash-alert-amount" className="text-xs">
                Tutar (TL)
              </Label>
              <Input
                id="cash-alert-amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                maxLength={6}
                disabled={loading}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cash-alert-minutes" className="text-xs">
                Süre (dk)
              </Label>
              <Input
                id="cash-alert-minutes"
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))}
                maxLength={4}
                disabled={loading}
                className="font-mono"
              />
            </div>
          </div>
          <Button onClick={() => void save()} disabled={saving || loading} className="mt-2 w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Kaydet
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
