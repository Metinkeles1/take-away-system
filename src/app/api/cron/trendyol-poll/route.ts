// Trendyol GO Yemek polling endpoint'i.
//
// Webhook yedeği / alternatifi olarak Trendyol'un "/packages" servisini
// periyodik olarak sorgular, yeni siparişleri DB'ye yazar.
//
// Tetiklenme yolları:
//   1) Vercel Cron — vercel.json içindeki schedule (1 dk)
//   2) Manuel: ?secret=<CRON_SECRET> ile GET çağrısı
//
// Idempotency: externalRef (packageId) üzerinden unique kontrol;
// aynı paket tekrar gelirse status güncellenir, yeniden eklenmez.

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import { listTrendyolPackages } from "@/lib/integrations/trendyol/client";
import { packageToWebhookOrder } from "@/lib/integrations/trendyol/poller";
import { mapTrendyolOrder } from "@/lib/integrations/trendyol/mapper";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  // Vercel Cron istekleri Authorization: Bearer <CRON_SECRET> ile gelir.
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;

  // Manuel/elden çalıştırma için query secret de kabul.
  const url = new URL(req.url);
  if (secret && url.searchParams.get("secret") === secret) return true;

  // CRON_SECRET tanımlı değilse dev için izinli — prod'a deploy etmeden önce set et.
  if (!secret && process.env.NODE_ENV !== "production") return true;
  return false;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Son 30 dk'da değişen, aktif statüdeki paketleri çek.
  const now = Date.now();
  const since = now - 30 * 60 * 1000;

  const res = await listTrendyolPackages({
    packageStatuses: "Created,Picking",
    modificationStartDate: since,
    modificationEndDate: now,
    page: 0,
    size: 50,
  });

  if (!res.ok) {
    console.error("[trendyol poll] list error:", res.status, res.error);
    return NextResponse.json(
      { ok: false, status: res.status, error: res.error },
      { status: 502 },
    );
  }

  const packages = res.data.content ?? [];
  console.log("[trendyol poll] fetched", packages.length, "package(s)");

  await connectDB();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const pkg of packages) {
    try {
      const webhookOrder = packageToWebhookOrder(pkg);
      const mapped = mapTrendyolOrder(webhookOrder);
      if (!mapped.ok) {
        errors.push({ id: pkg.id, error: mapped.error });
        continue;
      }
      const { order } = mapped;

      const existing = await OrderModel.findOne({ externalRef: order.externalRef });
      if (existing) {
        if (existing.status !== order.status) {
          existing.status = order.status;
          await existing.save();
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      await OrderModel.create({
        id: order.id,
        orderNumber: order.orderNumber,
        items: order.items,
        customer: order.customer,
        payment: order.payment,
        status: "preparing",
        notes: order.notes,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        total: order.total,
        source: "trendyol",
        externalRef: order.externalRef,
      });
      created++;
    } catch (err) {
      errors.push({
        id: pkg.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  if (created > 0 || updated > 0) revalidatePath("/orders");

  console.log("[trendyol poll] done", { created, updated, skipped, errors: errors.length });
  return NextResponse.json({
    ok: true,
    fetched: packages.length,
    created,
    updated,
    skipped,
    errors,
  });
}
