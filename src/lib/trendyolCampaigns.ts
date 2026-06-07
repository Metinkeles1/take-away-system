// Trendyol GO by Uber Eats — sepet indirim kampanyaları (grup bazlı).
//
// Mantık (kullanıcı teyidi):
//  - "Her X TL'lik siparişte Y TL indirim" → EŞİK mantığı: siparişin ulaştığı
//    EN YÜKSEK kademe geçerlidir (katlanmaz).
//  - Flaş indirim YALNIZCA TGO by Uber Eats uygulaması siparişlerinde geçerli.
//  - Flaş ile normal kademe BİRLEŞMEZ; müşteri en avantajlı (yüksek) olanı alır.

// Trendyol'un satış (indirim sonrası tutar) üzerinden kestiği komisyon oranı.
// Kullanıcının mağazası için %12. Sözleşmeye göre değişebilir — tek nokta.
export const TRENDYOL_COMMISSION_RATE = 0.12;

export interface CampaignTier {
  min: number; // bu tutara ulaşınca (sepet ≥ min)
  discount: number; // kazanılan indirim (TL)
}

export interface CampaignGroup {
  id: number;
  tiers: CampaignTier[]; // normal kademeler (artan)
  flash: CampaignTier[]; // flaş kademeleri (yalnız uygulama) — çok kademeli
}

export const CAMPAIGN_GROUPS: CampaignGroup[] = [
  {
    id: 1,
    tiers: [
      { min: 250, discount: 70 },
      { min: 325, discount: 110 },
      { min: 400, discount: 150 },
    ],
    flash: [
      { min: 250, discount: 100 },
      { min: 350, discount: 130 },
      { min: 450, discount: 160 },
      { min: 550, discount: 200 },
    ],
  },
  {
    id: 2,
    tiers: [
      { min: 275, discount: 70 },
      { min: 350, discount: 100 },
      { min: 450, discount: 150 },
    ],
    flash: [{ min: 550, discount: 200 }],
  },
  {
    id: 3,
    tiers: [
      { min: 350, discount: 100 },
      { min: 475, discount: 140 },
      { min: 600, discount: 190 },
    ],
    flash: [{ min: 750, discount: 250 }],
  },
  {
    id: 4,
    tiers: [
      { min: 400, discount: 80 },
      { min: 550, discount: 150 },
      { min: 700, discount: 200 },
    ],
    flash: [{ min: 850, discount: 250 }],
  },
  {
    id: 5,
    tiers: [
      { min: 250, discount: 100 },
      { min: 350, discount: 130 },
      { min: 450, discount: 160 },
    ],
    flash: [{ min: 550, discount: 200 }],
  },
];

export function getCampaignGroup(groupId: number): CampaignGroup | undefined {
  return CAMPAIGN_GROUPS.find((g) => g.id === groupId);
}

export type DiscountSource = "none" | "regular" | "flash";

export interface DiscountResult {
  discount: number; // uygulanan indirim
  net: number; // müşterinin ödeyeceği (sepet − indirim)
  source: DiscountSource; // indirim hangi kademeden geldi
  regularDiscount: number; // ulaşılan en iyi normal kademe indirimi
  regularTier: CampaignTier | null; // hangi normal kademe
  flashDiscount: number; // uygulanabilir flaş indirimi (uygunsa)
  flashEligible: boolean; // flaş kademe eşiği geçildi mi (ve uygulama mı)
  nextTier: CampaignTier | null; // bir üst kademeye ne kadar kaldı (bilgi)
  amountToNextTier: number; // sonraki kademeye kalan TL
}

export interface AverageDiscountResult {
  discount: number; // 5 grubun indirim ortalaması (TL, yuvarlanmış)
  net: number; // fiyat − ortalama indirim
  groupCount: number;
  anyFlash: boolean; // herhangi bir grupta flaş indirime denk geldi mi
  perGroup: { groupId: number; discount: number; source: DiscountSource }[];
}

// Hangi gruba girileceği belli değilse "ortalama senaryo": tüm grupların
// bu fiyata verdiği indirimi hesaplayıp ortalamasını alır.
export function calcAverageDiscount(
  amount: number,
  onApp: boolean,
): AverageDiscountResult {
  const perGroup = CAMPAIGN_GROUPS.map((g) => {
    const r = calcCampaignDiscount(g, amount, onApp);
    return { groupId: g.id, discount: r.discount, source: r.source };
  });
  const total = perGroup.reduce((s, p) => s + p.discount, 0);
  const discount = Math.round(total / perGroup.length);
  return {
    discount,
    net: Math.max(0, amount - discount),
    groupCount: perGroup.length,
    anyFlash: perGroup.some((p) => p.source === "flash"),
    perGroup,
  };
}

// Bir kademe dizisinde, tutarın ulaştığı en yüksek indirimli kademe.
function bestTierReached(
  tiers: CampaignTier[],
  amount: number,
): CampaignTier | null {
  let best: CampaignTier | null = null;
  for (const t of tiers) {
    if (amount >= t.min && (best === null || t.discount > best.discount)) {
      best = t;
    }
  }
  return best;
}

// amount: sepet tutarı (TL). onApp: TGO by Uber Eats uygulaması siparişi mi.
export function calcCampaignDiscount(
  group: CampaignGroup,
  amount: number,
  onApp: boolean,
): DiscountResult {
  // En yüksek aşılan normal kademe.
  const regularTier = bestTierReached(group.tiers, amount);
  const regularDiscount = regularTier?.discount ?? 0;

  // En yüksek aşılan flaş kademesi (yalnız uygulama siparişinde).
  const flashTier = onApp ? bestTierReached(group.flash, amount) : null;
  const flashEligible = flashTier !== null;
  const flashDiscount = flashTier?.discount ?? 0;

  // En avantajlısı (birleşmez).
  let discount = regularDiscount;
  let source: DiscountSource = regularDiscount > 0 ? "regular" : "none";
  if (flashDiscount > discount) {
    discount = flashDiscount;
    source = "flash";
  }

  // Bilgi: bir sonraki erişilebilir kademe (normal kademeler + uygulamadaysa flaş).
  const candidates = [...group.tiers, ...(onApp ? group.flash : [])]
    .filter((t) => t.min > amount)
    .sort((a, b) => a.min - b.min);
  const nextTier = candidates[0] ?? null;

  return {
    discount,
    net: Math.max(0, amount - discount),
    source,
    regularDiscount,
    regularTier,
    flashDiscount,
    flashEligible,
    nextTier,
    amountToNextTier: nextTier ? nextTier.min - amount : 0,
  };
}
