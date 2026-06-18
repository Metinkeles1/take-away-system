"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";

const MULTI_COURIER_KEY = "multiCourierMode";
const SHOP_LOCATION_KEY = "shopLocation";

export interface ShopLocation {
  lat: number;
  lng: number;
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
