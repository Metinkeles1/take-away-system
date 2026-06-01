import { NextResponse } from "next/server";
import { updateOrderStatus } from "@/actions/orders";
import { saveDeliveryLocation } from "@/actions/courier";

// Kurye "Teslim Et" için özel endpoint. Kurye sayfası bunu `fetch(..., { keepalive: true })`
// ile çağırır; böylece hemen ardından WhatsApp açılıp tarayıcı arka plana atılsa bile
// istek yarıda kesilmez ve sipariş güvenilir biçimde "delivered" olarak işaretlenir.
// Opsiyonel lat/lng: kuryenin teslim anındaki GPS konumu — adrese pin olarak kaydedilir.
export async function POST(req: Request) {
  try {
    const { id, lat, lng } = (await req.json()) as {
      id?: string;
      lat?: number;
      lng?: number;
    };
    if (!id) {
      return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });
    }
    const res = await updateOrderStatus(id, "delivered");
    // Konum geldiyse pinle (best-effort; teslim durumu bundan bağımsız başarılı sayılır).
    if (res.ok && typeof lat === "number" && typeof lng === "number") {
      await saveDeliveryLocation(id, { lat, lng });
    }
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  } catch (err) {
    console.error("[POST /api/orders/deliver]", err);
    return NextResponse.json({ ok: false, error: "Teslim güncellenemedi" }, { status: 500 });
  }
}
