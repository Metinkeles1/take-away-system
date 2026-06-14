"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import CourierModel from "@/models/Courier";

export interface Courier {
  id: string;
  name: string;
  active: boolean;
}

function toCourier(doc: unknown): Courier {
  const d = doc as { id: string; name: string; active?: boolean };
  return { id: d.id, name: d.name, active: d.active ?? true };
}

// Aktif kuryeler — kurye uygulamasındaki isim seçici bu listeden okur.
export async function getActiveCouriers(): Promise<Courier[]> {
  try {
    await connectDB();
    const docs = await CourierModel.find({ active: true })
      .sort({ name: 1 })
      .lean();
    return docs.map(toCourier);
  } catch (error) {
    console.error("[getActiveCouriers]", error);
    return [];
  }
}

// Tüm kuryeler (pasifler dahil) — ayarlar sayfası yönetimi için.
export async function getCouriers(): Promise<Courier[]> {
  try {
    await connectDB();
    const docs = await CourierModel.find({}).sort({ name: 1 }).lean();
    return docs.map(toCourier);
  } catch (error) {
    console.error("[getCouriers]", error);
    return [];
  }
}

export async function addCourier(
  name: string,
): Promise<{ ok: boolean; error?: string; courier?: Courier }> {
  try {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return { ok: false, error: "İsim en az 2 karakter olmalı" };
    }
    await connectDB();

    // Aynı isim varsa (büyük/küçük duyarsız) tekrar ekleme; pasifse aktifleştir.
    const existing = await CourierModel.findOne({
      name: { $regex: `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (existing) {
      if (!existing.active) {
        existing.active = true;
        await existing.save();
      } else {
        return { ok: false, error: "Bu isimde bir kurye zaten var" };
      }
      revalidatePath("/settings");
      return { ok: true, courier: toCourier(existing) };
    }

    const doc = await CourierModel.create({
      id: crypto.randomUUID(),
      name: trimmed,
      active: true,
    });
    revalidatePath("/settings");
    return { ok: true, courier: toCourier(doc) };
  } catch (error) {
    console.error("[addCourier]", error);
    return { ok: false, error: "Kurye eklenemedi" };
  }
}

export async function renameCourier(
  id: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return { ok: false, error: "İsim en az 2 karakter olmalı" };
    }
    await connectDB();
    const doc = await CourierModel.findOneAndUpdate(
      { id },
      { name: trimmed },
    );
    if (!doc) return { ok: false, error: "Kurye bulunamadı" };
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[renameCourier]", error);
    return { ok: false, error: "Kurye güncellenemedi" };
  }
}

// Pasifle / aktifle. Silmek yerine pasifleme tercih edilir: geçmiş siparişlerdeki
// kurye adı korunur, kurye listeden düşer.
export async function setCourierActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();
    const doc = await CourierModel.findOneAndUpdate({ id }, { active });
    if (!doc) return { ok: false, error: "Kurye bulunamadı" };
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[setCourierActive]", error);
    return { ok: false, error: "Kurye güncellenemedi" };
  }
}

export async function deleteCourier(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();
    await CourierModel.findOneAndDelete({ id });
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[deleteCourier]", error);
    return { ok: false, error: "Kurye silinemedi" };
  }
}
