"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Zap, Tag, ArrowRight, Smartphone } from "lucide-react";
import {
  CAMPAIGN_GROUPS,
  getCampaignGroup,
  calcCampaignDiscount,
} from "@/lib/trendyolCampaigns";

export function CampaignCalculator() {
  const [groupId, setGroupId] = useState(1);
  const [amountInput, setAmountInput] = useState("");
  const [onApp, setOnApp] = useState(true);

  const group = getCampaignGroup(groupId)!;
  const amount = useMemo(() => {
    const v = parseFloat(amountInput.replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [amountInput]);

  const result = useMemo(
    () => calcCampaignDiscount(group, amount, onApp),
    [group, amount, onApp],
  );

  const hasAmount = amount > 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Kampanya İndirim Hesaplayıcı</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Grup ve sepet tutarına göre müşterinin kazanacağı indirimi hesapla. Flaş
          indirim yalnızca TGO by Uber Eats uygulaması siparişlerinde geçerlidir ve
          normal kademeyle birleşmez (en avantajlısı uygulanır).
        </p>
      </div>

      {/* Girdiler */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardContent className="p-4 space-y-4">
          {/* Grup seçimi */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Grup
            </label>
            <div className="mt-1.5 inline-flex flex-wrap gap-1.5">
              {CAMPAIGN_GROUPS.map((g) => {
                const active = g.id === groupId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroupId(g.id)}
                    className={`h-9 w-12 rounded-lg text-sm font-bold transition-colors ${
                      active
                        ? "bg-orange-500 text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {g.id}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sepet tutarı */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-50">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sepet Tutarı (TL)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="örn. 500"
                className="mt-1.5 w-full rounded-lg border px-3 py-2 text-base font-semibold outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>

            <button
              type="button"
              onClick={() => setOnApp((v) => !v)}
              className={`flex h-[42px] items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
                onApp
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <Smartphone className="h-4 w-4" />
              TGO by Uber Eats
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  onApp ? "bg-violet-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    onApp ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Sonuç */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardContent className="p-4">
          {!hasAmount ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Sepet tutarı girin
            </p>
          ) : result.discount === 0 ? (
            <div className="py-2">
              <p className="text-sm font-medium text-gray-700">
                Bu tutarda indirim yok.
              </p>
              {result.nextTier && (
                <p className="mt-1 text-xs text-gray-500">
                  {formatCurrency(result.amountToNextTier)} daha eklenirse{" "}
                  <span className="font-semibold text-emerald-700">
                    {formatCurrency(result.nextTier.discount)}
                  </span>{" "}
                  indirim ({formatCurrency(result.nextTier.min)} eşiği).
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {result.source === "flash" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                      <Zap className="h-3 w-3" />
                      Flaş İndirim
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                      <Tag className="h-3 w-3" />
                      Kademe İndirimi
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">
                    Kazanılan İndirim
                  </p>
                  <p className="text-2xl font-bold text-emerald-700 tabular-nums">
                    −{formatCurrency(result.discount)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-sm">
                <span className="text-gray-500">Sepet</span>
                <span className="font-medium tabular-nums">{formatCurrency(amount)}</span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500">Müşteri öder</span>
                <span className="font-bold text-gray-900 tabular-nums">
                  {formatCurrency(result.net)}
                </span>
              </div>

              {/* Flaş vs kademe karşılaştırma ipucu */}
              {result.flashEligible && result.regularDiscount > 0 && (
                <p className="text-[11px] text-gray-500">
                  Kademe {formatCurrency(result.regularDiscount)} · Flaş{" "}
                  {formatCurrency(result.flashDiscount)} → en avantajlısı uygulandı.
                </p>
              )}
              {result.nextTier && (
                <p className="text-[11px] text-gray-500">
                  {formatCurrency(result.amountToNextTier)} daha →{" "}
                  {formatCurrency(result.nextTier.discount)} indirim (
                  {formatCurrency(result.nextTier.min)} eşiği).
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seçili grubun kademeleri (referans) */}
      <Card className="bg-white rounded-2xl border shadow-sm">
        <CardContent className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Grup {group.id} kademeleri
          </p>
          <div className="space-y-1.5">
            {group.tiers.map((t) => {
              const active =
                hasAmount &&
                result.source === "regular" &&
                result.regularTier?.min === t.min;
              return (
                <TierRow
                  key={t.min}
                  label={`${formatCurrency(t.min)} ve üzeri`}
                  discount={t.discount}
                  active={active}
                  tone="orange"
                />
              );
            })}
            <TierRow
              label={`${formatCurrency(group.flash.min)} ve üzeri · Flaş (yalnız uygulama)`}
              discount={group.flash.discount}
              active={hasAmount && result.source === "flash"}
              tone="violet"
              icon
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TierRow({
  label,
  discount,
  active,
  tone,
  icon,
}: {
  label: string;
  discount: number;
  active: boolean;
  tone: "orange" | "violet";
  icon?: boolean;
}) {
  const ring = active
    ? tone === "violet"
      ? "border-violet-400 bg-violet-50"
      : "border-orange-400 bg-orange-50"
    : "border-gray-100 bg-white";
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${ring}`}
    >
      <span className="flex items-center gap-1.5 text-gray-700">
        {icon && <Zap className="h-3.5 w-3.5 text-violet-500" />}
        {label}
      </span>
      <span className="font-semibold text-emerald-700 tabular-nums">
        −{formatCurrency(discount)}
      </span>
    </div>
  );
}
