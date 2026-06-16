import { NextResponse } from "next/server";
import {
  setOrderPaymentStatus,
  settleCustomerOpenAccounts,
  updateOrderStatus,
} from "@/actions/orders";

// Kurye "Teslim Et" için özel endpoint. Kurye sayfası bu isteği BEKLER; başarılı
// yanıt alınca WhatsApp'ı açar. Böylece durum güvenilir biçimde "delivered" yazılır.
// (Konum pinleme ayrı bir akış — "Konumu Pinle" butonu doğrudan saveDeliveryLocation
// server action'ını çağırır; burada GPS işlenmez.)
//
// openAccount=true: kurye kapıda ödeme alamadı → sipariş teslim edilir AMA "açık
// hesap" (ödenmedi) olarak işaretlenir; /open-accounts sayfasından sonra tahsil edilir.
// settleOpenAccounts=true: kurye kapıda eski borçları da tahsil etti → bu müşterinin
// TÜM açık hesapları kapatılır. openAccount ile birlikte gelmez (çelişki: ödeme yok).
export async function POST(req: Request) {
  try {
    const { id, openAccount, settleOpenAccounts, courier } = (await req.json()) as {
      id?: string;
      openAccount?: boolean;
      settleOpenAccounts?: boolean;
      courier?: string;
    };
    if (!id) {
      return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });
    }
    // Teslim eden kuryeyi siparişe damgala (geçmişte "kim teslim etti" görünsün).
    const res = await updateOrderStatus(id, "delivered", courier);
    if (res.ok && openAccount) {
      const acc = await setOrderPaymentStatus(id, "open");
      if (!acc.ok) return NextResponse.json(acc, { status: 400 });
    } else if (res.ok && settleOpenAccounts) {
      const acc = await settleCustomerOpenAccounts(id);
      if (!acc.ok) return NextResponse.json(acc, { status: 400 });
    }
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  } catch (err) {
    console.error("[POST /api/orders/deliver]", err);
    return NextResponse.json({ ok: false, error: "Teslim güncellenemedi" }, { status: 500 });
  }
}
