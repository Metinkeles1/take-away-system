"use server";

// Trendyol kampanya kademeleri + komisyon oranı — sunucuda (Setting koleksiyonu)
// tutulur ki her cihaz/tarayıcı aynı değerleri görsün. Kayıt yoksa
// trendyolCampaigns.ts'teki sözleşme varsayılanları döner.
// Menü sayfası (indirim/hakediş hesabı) ve Kampanyalar sayfası buradan okur.

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";
import {
  CAMPAIGN_GROUPS,
  TRENDYOL_COMMISSION_RATE,
  type CampaignGroup,
  type CampaignTier,
} from "@/lib/trendyolCampaigns";

const KEY = "trendyolCampaignSettings";

export interface CampaignSettings {
  activeGroupId: number; // menü hesabının baz aldığı grup
  groups: CampaignGroup[];
  commissionRate: number; // 0.12 = %12
}

function defaults(): CampaignSettings {
  return {
    activeGroupId: 1,
    groups: CAMPAIGN_GROUPS.map((g) => ({
      id: g.id,
      tiers: [...g.tiers],
      flash: [...g.flash],
    })),
    commissionRate: TRENDYOL_COMMISSION_RATE,
  };
}

// Kademe listesini temizle: geçersizleri at, kuruşa yuvarla, eşiğe göre sırala,
// aynı eşik iki kez yazılmışsa sonuncusu kalsın.
function cleanTiers(raw: unknown): CampaignTier[] {
  if (!Array.isArray(raw)) return [];
  const byMin = new Map<number, number>();
  for (const t of raw) {
    const min = Math.round(Number((t as CampaignTier)?.min) * 100) / 100;
    const discount = Math.round(Number((t as CampaignTier)?.discount) * 100) / 100;
    if (!Number.isFinite(min) || !Number.isFinite(discount)) continue;
    if (min <= 0 || discount <= 0 || discount >= min) continue;
    byMin.set(min, discount);
  }
  return [...byMin.entries()]
    .map(([min, discount]) => ({ min, discount }))
    .sort((a, b) => a.min - b.min);
}

function sanitize(raw: unknown): CampaignSettings {
  const base = defaults();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<CampaignSettings>;

  const groups = base.groups.map((def) => {
    const saved = Array.isArray(o.groups)
      ? o.groups.find((g) => g?.id === def.id)
      : undefined;
    if (!saved) return def;
    return { id: def.id, tiers: cleanTiers(saved.tiers), flash: cleanTiers(saved.flash) };
  });

  const activeGroupId = groups.some((g) => g.id === o.activeGroupId)
    ? (o.activeGroupId as number)
    : base.activeGroupId;

  const rate = Number(o.commissionRate);
  const commissionRate =
    Number.isFinite(rate) && rate >= 0 && rate < 1 ? rate : base.commissionRate;

  return { activeGroupId, groups, commissionRate };
}

export async function getCampaignSettings(): Promise<CampaignSettings> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: KEY }).select("value").lean();
    return sanitize((doc as unknown as { value?: unknown } | null)?.value);
  } catch (error) {
    console.error("[getCampaignSettings]", error);
    return defaults();
  }
}

export async function saveCampaignSettings(
  input: CampaignSettings,
): Promise<{ ok: boolean; settings?: CampaignSettings; error?: string }> {
  try {
    const settings = sanitize(input);
    const active = settings.groups.find((g) => g.id === settings.activeGroupId);
    if (!active || active.tiers.length + active.flash.length === 0) {
      return { ok: false, error: "Aktif grupta en az bir geçerli kademe olmalı." };
    }
    await connectDB();
    await SettingModel.updateOne(
      { key: KEY },
      { $set: { value: settings } },
      { upsert: true },
    );
    revalidatePath("/dashboard/trendyol/promotions");
    return { ok: true, settings };
  } catch (error) {
    console.error("[saveCampaignSettings]", error);
    return { ok: false, error: "Ayarlar kaydedilemedi." };
  }
}

export async function resetCampaignSettings(): Promise<CampaignSettings> {
  await connectDB();
  await SettingModel.deleteOne({ key: KEY });
  revalidatePath("/dashboard/trendyol/promotions");
  return defaults();
}
