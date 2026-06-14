"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";

const MULTI_COURIER_KEY = "multiCourierMode";

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
