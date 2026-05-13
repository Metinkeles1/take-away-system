"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import CorporateModel from "@/models/Corporate";
import VoucherModel from "@/models/Voucher";
import { nextSequence } from "@/models/Counter";
import {
  type BillingType,
  type PeriodStats,
  type Voucher,
  type VoucherInput,
  type VoucherItem,
} from "@/types";
import { periodRange } from "@/lib/period";

function docToVoucher(doc: Record<string, unknown>): Voucher {
  return {
    id: doc.id as string,
    voucherNumber: doc.voucherNumber as number,
    corporateId: doc.corporateId as string,
    corporateName: doc.corporateName as string,
    billingType: ((doc.billingType as BillingType | undefined) ?? "per_person"),
    date: doc.date as Date,
    personCount: (doc.personCount as number | undefined) ?? undefined,
    pricePerPerson: (doc.pricePerPerson as number | undefined) ?? undefined,
    items: (doc.items as VoucherItem[] | undefined) ?? undefined,
    total: doc.total as number,
    note: (doc.note as string | undefined) ?? undefined,
    paid: Boolean(doc.paid),
    paidAt: (doc.paidAt as Date | undefined) ?? undefined,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt,
  };
}

export async function getVouchersByCorporate(
  corporateId: string,
  options?: { period?: string },
): Promise<Voucher[]> {
  await connectDB();
  const filter: Record<string, unknown> = { corporateId };

  if (options?.period) {
    const { start, end } = periodRange(options.period);
    filter.date = { $gte: start, $lt: end };
  }

  const docs = await VoucherModel.find(filter)
    .sort({ date: -1, voucherNumber: -1 })
    .lean();
  return docs.map((d) => docToVoucher(d as Record<string, unknown>));
}

export async function getVoucherById(id: string): Promise<Voucher | null> {
  await connectDB();
  const doc = await VoucherModel.findOne({ id }).lean();
  if (!doc) return null;
  return docToVoucher(doc as Record<string, unknown>);
}

export async function getPeriodStats(
  corporateId: string,
  period: string,
): Promise<PeriodStats> {
  await connectDB();
  const { start, end } = periodRange(period);

  const agg = await VoucherModel.aggregate<{
    count: number;
    total: number;
    paid: number;
    unpaid: number;
  }>([
    { $match: { corporateId, date: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        total: { $sum: "$total" },
        paid: { $sum: { $cond: ["$paid", "$total", 0] } },
        unpaid: { $sum: { $cond: ["$paid", 0, "$total"] } },
      },
    },
  ]);

  const r = agg[0];
  return {
    count: r?.count ?? 0,
    total: r?.total ?? 0,
    paid: r?.paid ?? 0,
    unpaid: r?.unpaid ?? 0,
  };
}

export async function getAvailablePeriods(corporateId: string): Promise<string[]> {
  await connectDB();

  const agg = await VoucherModel.aggregate<{ _id: string }>([
    { $match: { corporateId } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
      },
    },
    { $sort: { _id: -1 } },
  ]);
  return agg.map((a) => a._id);
}

export async function createVoucher(
  input: VoucherInput,
): Promise<{ ok: boolean; error?: string; voucherNumber?: number; voucherId?: string }> {
  try {
    await connectDB();

    const corporate = await CorporateModel.findOne({ id: input.corporateId }).lean<{
      id: string;
      name: string;
      pricePerPerson?: number;
    }>();
    if (!corporate) {
      return { ok: false, error: "Kurumsal müşteri bulunamadı." };
    }

    const voucherNumber = await nextSequence("voucher");
    const id = crypto.randomUUID();

    if (input.type === "per_person") {
      const pricePerPerson = input.pricePerPerson ?? corporate.pricePerPerson ?? 0;
      if (pricePerPerson <= 0) {
        return { ok: false, error: "Kişi başı ücret tanımsız." };
      }
      const total = Math.round(input.personCount * pricePerPerson * 100) / 100;

      await VoucherModel.create({
        id,
        voucherNumber,
        corporateId: corporate.id,
        corporateName: corporate.name,
        billingType: "per_person",
        date: input.date,
        personCount: input.personCount,
        pricePerPerson,
        total,
        note: input.note,
        paid: false,
      });
    } else {
      if (!input.items.length) {
        return { ok: false, error: "En az bir ürün seçin." };
      }
      const total =
        Math.round(input.items.reduce((s, it) => s + it.totalPrice, 0) * 100) / 100;

      await VoucherModel.create({
        id,
        voucherNumber,
        corporateId: corporate.id,
        corporateName: corporate.name,
        billingType: "per_item",
        date: input.date,
        items: input.items,
        total,
        note: input.note,
        paid: false,
      });
    }

    await CorporateModel.findOneAndUpdate(
      { id: corporate.id },
      { $inc: { voucherCount: 1 } },
    );

    revalidatePath(`/corporate/${corporate.id}`);
    revalidatePath("/corporate");

    return { ok: true, voucherNumber, voucherId: id };
  } catch (error) {
    console.error("[createVoucher]", error);
    return { ok: false, error: "Fiş oluşturulamadı." };
  }
}

export async function updateVoucher(
  id: string,
  input: VoucherInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();

    const existing = await VoucherModel.findOne({ id }).lean<{
      id: string;
      paid: boolean;
      corporateId: string;
    }>();
    if (!existing) return { ok: false, error: "Fiş bulunamadı." };
    if (existing.paid) {
      return { ok: false, error: "Tahsil edilmiş fiş düzenlenemez." };
    }
    if (existing.corporateId !== input.corporateId) {
      return { ok: false, error: "Fiş başka bir kuruma taşınamaz." };
    }

    const corporate = await CorporateModel.findOne({ id: input.corporateId }).lean<{
      id: string;
      name: string;
      pricePerPerson?: number;
    }>();
    if (!corporate) {
      return { ok: false, error: "Kurumsal müşteri bulunamadı." };
    }

    if (input.type === "per_person") {
      const pricePerPerson = input.pricePerPerson ?? corporate.pricePerPerson ?? 0;
      if (pricePerPerson <= 0) {
        return { ok: false, error: "Kişi başı ücret tanımsız." };
      }
      const total = Math.round(input.personCount * pricePerPerson * 100) / 100;

      await VoucherModel.updateOne(
        { id },
        {
          $set: {
            billingType: "per_person",
            date: input.date,
            personCount: input.personCount,
            pricePerPerson,
            total,
            note: input.note ?? null,
          },
          $unset: { items: "" },
        },
      );
    } else {
      if (!input.items.length) {
        return { ok: false, error: "En az bir ürün seçin." };
      }
      const total =
        Math.round(input.items.reduce((s, it) => s + it.totalPrice, 0) * 100) / 100;

      await VoucherModel.updateOne(
        { id },
        {
          $set: {
            billingType: "per_item",
            date: input.date,
            items: input.items,
            total,
            note: input.note ?? null,
          },
          $unset: { personCount: "", pricePerPerson: "" },
        },
      );
    }

    revalidatePath(`/corporate/${corporate.id}`);
    revalidatePath("/corporate");

    return { ok: true };
  } catch (error) {
    console.error("[updateVoucher]", error);
    return { ok: false, error: "Fiş güncellenemedi." };
  }
}

export async function deleteVoucher(id: string): Promise<void> {
  await connectDB();
  const voucher = await VoucherModel.findOne({ id }).lean<{ corporateId: string }>();
  if (!voucher) return;

  await VoucherModel.deleteOne({ id });
  await CorporateModel.findOneAndUpdate(
    { id: voucher.corporateId },
    { $inc: { voucherCount: -1 } },
  );

  revalidatePath(`/corporate/${voucher.corporateId}`);
  revalidatePath("/corporate");
}

export async function markVoucherPaid(id: string, paid: boolean): Promise<void> {
  await connectDB();
  const voucher = await VoucherModel.findOneAndUpdate(
    { id },
    { $set: { paid, paidAt: paid ? new Date() : null } },
    { new: true },
  ).lean<{ corporateId: string }>();

  if (voucher) {
    revalidatePath(`/corporate/${voucher.corporateId}`);
  }
}

export async function markPeriodPaid(
  corporateId: string,
  period: string,
): Promise<{ updated: number }> {
  await connectDB();
  const { start, end } = periodRange(period);

  const result = await VoucherModel.updateMany(
    { corporateId, paid: false, date: { $gte: start, $lt: end } },
    { $set: { paid: true, paidAt: new Date() } },
  );

  revalidatePath(`/corporate/${corporateId}`);
  revalidatePath("/corporate");

  return { updated: result.modifiedCount ?? 0 };
}
