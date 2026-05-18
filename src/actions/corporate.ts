"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import CorporateModel from "@/models/Corporate";
import VoucherModel from "@/models/Voucher";
import { type BillingType, type Corporate, type CorporateInput } from "@/types";

function docToCorporate(doc: Record<string, unknown>): Corporate {
  return {
    id: doc.id as string,
    name: doc.name as string,
    phone: (doc.phone as string | undefined) ?? undefined,
    address: (doc.address as string | undefined) ?? undefined,
    billingType: ((doc.billingType as BillingType | undefined) ?? "per_person"),
    pricePerPerson: (doc.pricePerPerson as number | undefined) ?? undefined,
    voucherCount: (doc.voucherCount as number | undefined) ?? 0,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
  };
}

export async function getCorporates(): Promise<Corporate[]> {
  await connectDB();
  const docs = await CorporateModel.find().sort({ updatedAt: -1 }).lean();
  return docs.map((d) => docToCorporate(d as Record<string, unknown>));
}

export async function getCorporateById(id: string): Promise<Corporate | null> {
  await connectDB();
  const doc = await CorporateModel.findOne({ id }).lean();
  if (!doc) return null;
  return docToCorporate(doc as Record<string, unknown>);
}

export async function searchCorporates(query: string): Promise<Corporate[]> {
  await connectDB();
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");

  const docs = await CorporateModel.find({
    $or: [{ name: regex }, { phone: regex }],
  })
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();

  return docs.map((d) => docToCorporate(d as Record<string, unknown>));
}

export async function createCorporate(data: CorporateInput): Promise<void> {
  await connectDB();
  await CorporateModel.create({
    id: data.id,
    name: data.name,
    phone: data.phone,
    address: data.address,
    billingType: data.billingType,
    pricePerPerson: data.pricePerPerson,
    voucherCount: 0,
  });
  revalidatePath("/corporate");
}

export async function updateCorporate(
  id: string,
  data: Partial<Omit<CorporateInput, "id">>,
): Promise<void> {
  await connectDB();
  await CorporateModel.findOneAndUpdate({ id }, { $set: data });
  revalidatePath("/corporate");
  revalidatePath(`/corporate/${id}`);
}

export async function deleteCorporate(id: string): Promise<void> {
  await connectDB();
  await CorporateModel.deleteOne({ id });
  revalidatePath("/corporate");
}

// ─── Liste için: her kurumun tüm ödenmemiş açık bakiyesi ─────────────────────
export interface CorporateWithBalance extends Corporate {
  openBalance: number;
}

export async function getCorporatesWithBalance(): Promise<CorporateWithBalance[]> {
  await connectDB();

  // Tüm açık bakiyeleri tek pass'te al — kurumsallarla paralel
  // (corporateId IN [...] filtresi yapmak yerine tüm açık fişleri toplamak
  // büyük corporates kümesinde daha hızlı; sonra Map ile join.)
  const [corporates, agg] = await Promise.all([
    CorporateModel.find().sort({ updatedAt: -1 }).lean(),
    VoucherModel.aggregate<{ _id: string; openBalance: number }>([
      { $match: { paid: false } },
      { $group: { _id: "$corporateId", openBalance: { $sum: "$total" } } },
    ]),
  ]);

  const balanceMap = new Map(agg.map((a) => [a._id, a.openBalance]));
  return corporates.map((d) => {
    const c = docToCorporate(d as Record<string, unknown>);
    return { ...c, openBalance: balanceMap.get(c.id) ?? 0 };
  });
}
