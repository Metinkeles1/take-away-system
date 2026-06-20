"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";

const MULTI_COURIER_KEY = "multiCourierMode";
const SHOP_LOCATION_KEY = "shopLocation";
const SHOP_IBAN_KEY = "shopIban";
const MONTHLY_TARGET_KEY = "monthlyRevenueTarget";

export interface ShopLocation {
  lat: number;
  lng: number;
}

// Dükkanın tahsilat IBAN'ı — kurye "IBAN" ödeme seçtiğinde müşteriye gösterilir
// veya WhatsApp ile gönderilir. Ayarlar'dan bir kez girilir.
export interface ShopIban {
  name: string; // IBAN sahibi ad soyad / ünvan
  iban: string; // boşluksuz, büyük harf (TR...)
}

// Girilen IBAN'ı normalize eder: boşlukları siler, büyük harfe çevirir.
function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export async function getShopIban(): Promise<ShopIban | null> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: SHOP_IBAN_KEY })
      .select("value")
      .lean();
    const value = (doc as unknown as { value?: ShopIban })?.value;
    if (value && value.iban && value.name) {
      return { name: value.name, iban: value.iban };
    }
    return null;
  } catch (error) {
    console.error("[getShopIban]", error);
    return null;
  }
}

export async function setShopIban(
  data: ShopIban,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const name = data.name.trim();
    const iban = normalizeIban(data.iban);
    if (name.length < 2) {
      return { ok: false, error: "Ad soyad gerekli" };
    }
    // TR IBAN: "TR" + 24 rakam = 26 karakter. Esnek tutuyoruz ama temel kontrol.
    if (!/^TR\d{24}$/.test(iban)) {
      return { ok: false, error: "Geçersiz IBAN (TR + 24 rakam olmalı)" };
    }
    await connectDB();
    await SettingModel.updateOne(
      { key: SHOP_IBAN_KEY },
      { $set: { value: { name, iban } } },
      { upsert: true },
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[setShopIban]", error);
    return { ok: false, error: "IBAN kaydedilemedi" };
  }
}

// Dükkanın koordinatı — kurye ekranında müşteri pinine kuş uçuşu uzaklığı
// hesaplamak için kullanılır. Bir kez Ayarlar'dan haritayla pinlenir.
export async function getShopLocation(): Promise<ShopLocation | null> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: SHOP_LOCATION_KEY })
      .select("value")
      .lean();
    const value = (doc as unknown as { value?: ShopLocation })?.value;
    if (
      value &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng)
    ) {
      return { lat: value.lat, lng: value.lng };
    }
    return null;
  } catch (error) {
    console.error("[getShopLocation]", error);
    return null;
  }
}

export async function setShopLocation(
  loc: ShopLocation,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (
      !Number.isFinite(loc.lat) ||
      !Number.isFinite(loc.lng) ||
      Math.abs(loc.lat) > 90 ||
      Math.abs(loc.lng) > 180
    ) {
      return { ok: false, error: "Geçersiz konum" };
    }
    await connectDB();
    await SettingModel.updateOne(
      { key: SHOP_LOCATION_KEY },
      { $set: { value: { lat: loc.lat, lng: loc.lng } } },
      { upsert: true },
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[setShopLocation]", error);
    return { ok: false, error: "Konum kaydedilemedi" };
  }
}

// Aylık ciro hedefi — dashboard'da "Bu Ay" ilerleme çubuğu için. 0/boş = hedef
// yok (çubuk gizlenir). Ayarlar'dan girilir.
export async function getMonthlyTarget(): Promise<number> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: MONTHLY_TARGET_KEY })
      .select("value")
      .lean();
    const value = Number((doc as unknown as { value?: number })?.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    console.error("[getMonthlyTarget]", error);
    return 0;
  }
}

export async function setMonthlyTarget(
  target: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!Number.isFinite(target) || target < 0) {
      return { ok: false, error: "Geçersiz hedef" };
    }
    await connectDB();
    await SettingModel.updateOne(
      { key: MONTHLY_TARGET_KEY },
      { $set: { value: Math.round(target) } },
      { upsert: true },
    );
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[setMonthlyTarget]", error);
    return { ok: false, error: "Hedef kaydedilemedi" };
  }
}

// Çoklu kurye modu: açıkken kurye uygulamasında "üstlen / havuz" sistemi görünür;
// kapalıyken tek-kurye sade akış (tüm paketler doğrudan teslimatta). Varsayılan kapalı.
export async function getMultiCourierMode(): Promise<boolean> {
  try {
    await connectDB();
    const doc = await SettingModel.findOne({ key: MULTI_COURIER_KEY })
      .select("value")
      .lean();
    return Boolean((doc as unknown as { value?: boolean })?.value);
  } catch (error) {
    console.error("[getMultiCourierMode]", error);
    return false;
  }
}

export async function setMultiCourierMode(
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();
    await SettingModel.updateOne(
      { key: MULTI_COURIER_KEY },
      { $set: { value: on } },
      { upsert: true },
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[setMultiCourierMode]", error);
    return { ok: false, error: "Ayar kaydedilemedi" };
  }
}
