import { NextResponse } from "next/server";
import { updateOrderStatus } from "@/actions/orders";

// Kurye "Teslim Et" için özel endpoint. Kurye sayfası bu isteği BEKLER; başarılı
// yanıt alınca WhatsApp'ı açar. Böylece durum güvenilir biçimde "delivered" yazılır.
// (Konum pinleme ayrı bir akış — "Konumu Pinle" butonu doğrudan saveDeliveryLocation
// server action'ını çağırır; burada GPS işlenmez.)
export async function POST(req: Request) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) {
      return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });
    }
    const res = await updateOrderStatus(id, "delivered");
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  } catch (err) {
    console.error("[POST /api/orders/deliver]", err);
    return NextResponse.json({ ok: false, error: "Teslim güncellenemedi" }, { status: 500 });
  }
}
