import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import { mapTrendyolOrder } from "@/lib/integrations/trendyol/mapper";
import {
  type TrendyolWebhookEnvelope,
  type TrendyolWebhookOrder,
} from "@/lib/integrations/trendyol/types";
import { verifyTrendyolRequest } from "@/lib/integrations/trendyol/verify";
import { acceptTrendyolPackage } from "@/lib/integrations/trendyol/client";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!verifyTrendyolRequest(req.headers)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: TrendyolWebhookEnvelope | TrendyolWebhookOrder;
  try {
    body = (await req.json()) as TrendyolWebhookEnvelope | TrendyolWebhookOrder;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // Envelope ya da doğrudan order — her ikisini de destekle
  const raw: TrendyolWebhookOrder | undefined =
    "order" in body && body.order ? body.order : (body as TrendyolWebhookOrder);

  if (!raw) {
    return NextResponse.json({ ok: false, error: "missing order" }, { status: 400 });
  }

  const mapped = mapTrendyolOrder(raw);
  if (!mapped.ok) {
    return NextResponse.json({ ok: false, error: mapped.error }, { status: 400 });
  }

  const { order } = mapped;

  try {
    await connectDB();

    // Idempotency: aynı Trendyol siparişi tekrar geldiyse mevcut kaydı güncelle
    const existing = await OrderModel.findOne({ externalRef: order.externalRef });
    if (existing) {
      existing.status = order.status;
      await existing.save();
      revalidatePath("/orders");
      return NextResponse.json({ ok: true, deduped: true, id: existing.id });
    }

    // Otomatik kabul akışı:
    // 1) Önce DB'ye "preparing" olarak yaz (UI hemen görsün)
    // 2) Sonra Trendyol'a accept bildirimi gönder (best-effort)
    // Trendyol bildirimi başarısız olursa sipariş yine de panelimizde durur;
    // operatör manuel olarak yine kabul/red yapabilir.
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

    revalidatePath("/orders");

    // Outbound kabul bildirimi — başarısızsa loglayıp devam et.
    // MOCK-DEV-* siparişler lokal simülatörden gelir; Trendyol tarafında
    // karşılığı olmadığı için outbound çağrısını atla.
    const isMock = order.externalRef?.startsWith("MOCK-DEV-");
    if (order.externalRef && !isMock) {
      try {
        const ack = await acceptTrendyolPackage(order.externalRef);
        if (!ack.ok) {
          console.warn("[trendyol auto-accept] başarısız:", ack.status, ack.error);
        }
      } catch (err) {
        console.warn("[trendyol auto-accept] exception:", err);
      }
    } else if (isMock) {
      console.log("[trendyol webhook] mock sipariş — outbound atlandı:", order.externalRef);
    }

    return NextResponse.json({ ok: true, id: order.id, autoAccepted: true });
  } catch (error) {
    console.error("[trendyol webhook]", error);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }
}
