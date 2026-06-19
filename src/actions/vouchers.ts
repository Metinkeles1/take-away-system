"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import CorporateModel from "@/models/Corporate";
import VoucherModel from "@/models/Voucher";
import PaymentModel from "@/models/Payment";
import { nextSequence } from "@/models/Counter";
import {
  type BillingType,
  type Payment,
  type PaymentSource,
  type PeriodStats,
  type Voucher,
  type VoucherInput,
  type VoucherItem,
} from "@/types";
import { periodRange } from "@/lib/period";

async function recordPayment(args: {
  voucherId: string;
  corporateId: string;
  delta: number;
  source: PaymentSource;
  note?: string;
}): Promise<void> {
  if (args.delta === 0) return;
  await PaymentModel.create({
    id: crypto.randomUUID(),
    voucherId: args.voucherId,
    corporateId: args.corporateId,
    delta: Math.round(args.delta * 100) / 100,
    source: args.source,
    note: args.note,
  });
}

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
    paidAmount: (doc.paidAmount as number | undefined) ?? (doc.paid ? (doc.total as number) : 0),
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

/**
 * Bir kurumun TÜM dönemlerindeki açık (ödenmemiş) fişleri — açık hesap ekstresi
 * için. Kısmi ödenmiş fişler de dahildir (paid:false), kalan = total − paidAmount.
 * Tarih artan sırada döner (eski → yeni).
 */
export async function getOpenVouchersByCorporate(
  corporateId: string,
): Promise<Voucher[]> {
  await connectDB();
  const docs = await VoucherModel.find({ corporateId, paid: false })
    .sort({ date: 1, voucherNumber: 1 })
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
        paid: {
          $sum: {
            $cond: [
              "$paid",
              "$total",
              { $ifNull: ["$paidAmount", 0] },
            ],
          },
        },
        unpaid: {
          $sum: {
            $cond: [
              "$paid",
              0,
              { $subtract: ["$total", { $ifNull: ["$paidAmount", 0] }] },
            ],
          },
        },
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
): Promise<
  | { ok: true; voucherNumber: number; voucherId: string; voucher: Voucher }
  | { ok: false; error: string }
> {
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
    const now = new Date();

    let voucher: Voucher;
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

      voucher = {
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
        paidAmount: 0,
        createdAt: now,
        updatedAt: now,
      };
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

      voucher = {
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
        paidAmount: 0,
        createdAt: now,
        updatedAt: now,
      };
    }

    await CorporateModel.findOneAndUpdate(
      { id: corporate.id },
      { $inc: { voucherCount: 1 } },
    );

    revalidatePath(`/corporate/${corporate.id}`);
    revalidatePath("/corporate");

    return { ok: true, voucherNumber, voucherId: id, voucher };
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
  // Tahsilat geçmişi de fişle birlikte silinir — orphan payment kaydı kalmasın.
  await PaymentModel.deleteMany({ voucherId: id });
  await CorporateModel.findOneAndUpdate(
    { id: voucher.corporateId },
    { $inc: { voucherCount: -1 } },
  );

  revalidatePath(`/corporate/${voucher.corporateId}`);
  revalidatePath("/corporate");
}

// ─── Toplu silme: bulk seçim için ──────────────────────────────────────────
export async function deleteVouchers(
  ids: string[],
): Promise<{ deleted: number }> {
  if (!ids.length) return { deleted: 0 };
  await connectDB();

  const vouchers = await VoucherModel.find({ id: { $in: ids } })
    .select({ id: 1, corporateId: 1 })
    .lean<Array<{ id: string; corporateId: string }>>();
  if (!vouchers.length) return { deleted: 0 };

  // Kurum başına voucher sayısını gruplayıp tek update ile düşür
  const perCorp = new Map<string, number>();
  for (const v of vouchers) {
    perCorp.set(v.corporateId, (perCorp.get(v.corporateId) ?? 0) + 1);
  }

  await Promise.all([
    VoucherModel.deleteMany({ id: { $in: ids } }),
    PaymentModel.deleteMany({ voucherId: { $in: ids } }),
    ...Array.from(perCorp.entries()).map(([cid, n]) =>
      CorporateModel.findOneAndUpdate({ id: cid }, { $inc: { voucherCount: -n } }),
    ),
  ]);

  for (const cid of perCorp.keys()) revalidatePath(`/corporate/${cid}`);
  revalidatePath("/corporate");

  return { deleted: vouchers.length };
}

// ─── Toplu tahsilat işaretleme ─────────────────────────────────────────────
export async function markVouchersPaid(
  ids: string[],
  paid: boolean,
): Promise<{ updated: number }> {
  if (!ids.length) return { updated: 0 };
  await connectDB();

  const vouchers = await VoucherModel.find({ id: { $in: ids } })
    .select({ id: 1, corporateId: 1, total: 1, paidAmount: 1 })
    .lean<
      Array<{ id: string; corporateId: string; total: number; paidAmount?: number }>
    >();

  const now = new Date();
  const corporateIds = new Set<string>();

  await Promise.all(
    vouchers.flatMap((v) => {
      corporateIds.add(v.corporateId);
      const current = v.paidAmount ?? 0;
      const target = paid ? v.total : 0;
      const delta = Math.round((target - current) * 100) / 100;
      return [
        VoucherModel.updateOne(
          { id: v.id },
          {
            $set: {
              paid,
              paidAt: paid ? now : null,
              paidAmount: target,
            },
          },
        ),
        recordPayment({
          voucherId: v.id,
          corporateId: v.corporateId,
          delta,
          source: "manual_toggle",
        }),
      ];
    }),
  );

  for (const cid of corporateIds) revalidatePath(`/corporate/${cid}`);
  revalidatePath("/corporate");

  return { updated: vouchers.length };
}

export async function markVoucherPaid(id: string, paid: boolean): Promise<void> {
  await connectDB();
  const existing = await VoucherModel.findOne({ id }).lean<{
    corporateId: string;
    total: number;
    paidAmount?: number;
  }>();
  if (!existing) return;

  const current = existing.paidAmount ?? 0;
  const target = paid ? existing.total : 0;
  const delta = Math.round((target - current) * 100) / 100;

  await VoucherModel.updateOne(
    { id },
    {
      $set: {
        paid,
        paidAt: paid ? new Date() : null,
        paidAmount: target,
      },
    },
  );

  await recordPayment({
    voucherId: id,
    corporateId: existing.corporateId,
    delta,
    source: "manual_toggle",
  });

  revalidatePath(`/corporate/${existing.corporateId}`);
  revalidatePath("/corporate");
}

export async function markPeriodPaid(
  corporateId: string,
  period: string,
): Promise<{ updated: number }> {
  await connectDB();
  const { start, end } = periodRange(period);

  const open = await VoucherModel.find({
    corporateId,
    paid: false,
    date: { $gte: start, $lt: end },
  })
    .select({ id: 1, total: 1, paidAmount: 1 })
    .lean<Array<{ id: string; total: number; paidAmount?: number }>>();

  const now = new Date();
  await Promise.all(
    open.flatMap((v) => {
      const delta = Math.round((v.total - (v.paidAmount ?? 0)) * 100) / 100;
      return [
        VoucherModel.updateOne(
          { id: v.id },
          { $set: { paid: true, paidAt: now, paidAmount: v.total } },
        ),
        recordPayment({
          voucherId: v.id,
          corporateId,
          delta,
          source: "period_paid",
        }),
      ];
    }),
  );

  revalidatePath(`/corporate/${corporateId}`);
  revalidatePath("/corporate");

  return { updated: open.length };
}

// ─── Tahsilat geçmişi: bir fişin tüm payment hareketleri ───────────────────
export async function getVoucherPayments(voucherId: string): Promise<Payment[]> {
  await connectDB();
  const docs = await PaymentModel.find({ voucherId })
    .sort({ createdAt: -1 })
    .lean<
      Array<{
        id: string;
        voucherId: string;
        corporateId: string;
        delta: number;
        source: PaymentSource;
        note?: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >();

  return docs.map((d) => ({
    id: d.id,
    voucherId: d.voucherId,
    corporateId: d.corporateId,
    delta: d.delta,
    source: d.source,
    note: d.note,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

// ─── Tek fişin tahsil edilen tutarını doğrudan set et ──────────────────────
export async function setVoucherPaidAmount(
  id: string,
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  await connectDB();

  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Geçerli bir tutar girin." };
  }

  const existing = await VoucherModel.findOne({ id }).lean<{
    corporateId: string;
    total: number;
  }>();
  if (!existing) return { ok: false, error: "Fiş bulunamadı." };

  if (amount > existing.total + 0.005) {
    return { ok: false, error: "Tahsilat fiş toplamından büyük olamaz." };
  }

  const rounded = Math.round(amount * 100) / 100;
  const fullyPaid = rounded >= existing.total - 0.005;
  const normalized = fullyPaid ? existing.total : rounded;

  const currentDoc = await VoucherModel.findOne({ id })
    .select({ paidAmount: 1 })
    .lean<{ paidAmount?: number }>();
  const current = currentDoc?.paidAmount ?? 0;
  const delta = Math.round((normalized - current) * 100) / 100;

  await VoucherModel.updateOne(
    { id },
    {
      $set: {
        paidAmount: normalized,
        paid: fullyPaid,
        paidAt: fullyPaid ? new Date() : null,
      },
    },
  );

  await recordPayment({
    voucherId: id,
    corporateId: existing.corporateId,
    delta,
    source: "manual_edit",
  });

  revalidatePath(`/corporate/${existing.corporateId}`);
  revalidatePath("/corporate");

  return { ok: true };
}

// ─── Kısmi tahsilat: en eski açık fişten başlayarak tutarı dağıt ────────────
export async function collectAmount(
  corporateId: string,
  period: string,
  amount: number,
): Promise<{ applied: number; vouchersClosed: number; remaining: number }> {
  await connectDB();

  if (!Number.isFinite(amount) || amount <= 0) {
    return { applied: 0, vouchersClosed: 0, remaining: 0 };
  }

  const { start, end } = periodRange(period);

  const open = await VoucherModel.find({
    corporateId,
    paid: false,
    date: { $gte: start, $lt: end },
  })
    .sort({ date: 1, voucherNumber: 1 })
    .select({ id: 1, total: 1, paidAmount: 1 })
    .lean<Array<{ id: string; total: number; paidAmount?: number }>>();

  let remaining = Math.round(amount * 100) / 100;
  let applied = 0;
  let closed = 0;
  const now = new Date();

  for (const v of open) {
    if (remaining <= 0) break;
    const already = v.paidAmount ?? 0;
    const due = Math.round((v.total - already) * 100) / 100;
    if (due <= 0) continue;

    const pay = Math.min(remaining, due);
    const newPaid = Math.round((already + pay) * 100) / 100;
    const fullyPaid = newPaid >= v.total - 0.005;

    await VoucherModel.updateOne(
      { id: v.id },
      {
        $set: {
          paidAmount: fullyPaid ? v.total : newPaid,
          paid: fullyPaid,
          paidAt: fullyPaid ? now : null,
        },
      },
    );

    await recordPayment({
      voucherId: v.id,
      corporateId,
      delta: pay,
      source: "collect",
    });

    applied = Math.round((applied + pay) * 100) / 100;
    remaining = Math.round((remaining - pay) * 100) / 100;
    if (fullyPaid) closed += 1;
  }

  revalidatePath(`/corporate/${corporateId}`);
  revalidatePath("/corporate");

  return { applied, vouchersClosed: closed, remaining };
}
