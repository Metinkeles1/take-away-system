"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import { notifyOrdersChanged } from "@/lib/pusher/server";
import { toLocalPhone } from "@/lib/utils";
import {
  type CustomerInfo,
  type DiscountInput,
  type OrderItem,
  type PaymentInfo,
} from "@/types";
import { resolveDiscount } from "@/lib/orders/discount";
import { recordCustomerAddress } from "@/lib/customers/recordAddress";

interface UpdateOrderDetailsInput {
  items: OrderItem[];
  customer: CustomerInfo;
  notes?: string;
  // Sepet indirimi; boşsa sipariş indirimsiz kaydedilir (eskisi kaldırılır).
  discount?: DiscountInput | null;
  // Düzenleme ekranında ödeme yöntemi değiştirildiyse yeni ödeme bilgisi.
  payment?: Partial<PaymentInfo>;
  // Seçilen kayıtlı adres (customer.addressId) yeni adres yerine güncellensin.
  updateSavedAddress?: boolean;
}

// Manuel oluşturulan siparişlerin kalem/müşteri/not bilgisini günceller.
// Ödeme yöntemi de düzenleme ekranından değiştirilebildiği için burada yazılır;
// status için ayrı action var (updateOrderStatus).
export async function updateOrderDetails(
  id: string,
  input: UpdateOrderDetailsInput,
): Promise<{ ok: false; error: string }> {
  try {
    await connectDB();

    const existing = await OrderModel.findOne({ id });
    if (!existing) return { ok: false, error: "Sipariş bulunamadı" };

    if (existing.source && existing.source !== "manual") {
      return {
        ok: false,
        error: "Yalnızca manuel siparişler düzenlenebilir",
      };
    }

    if (input.items.length === 0) {
      return { ok: false, error: "Sipariş en az bir ürün içermelidir" };
    }

    if (!input.customer.phone || !input.customer.address) {
      return { ok: false, error: "Telefon ve adres zorunludur" };
    }

    const subtotal = input.items.reduce((sum, i) => sum + i.totalPrice, 0);
    // İndirim sunucuda yeniden hesaplanır: yüzde, yeni ara toplama uygulanır.
    const discount = resolveDiscount(subtotal, input.discount);
    const deliveryFee = existing.deliveryFee ?? 0;
    const total = subtotal - (discount?.amount ?? 0) + deliveryFee;

    // Telefonu tek standarda çek (0 + 10 hane).
    const customer: CustomerInfo = {
      ...input.customer,
      phone: toLocalPhone(input.customer.phone),
    };
    // Düzenlemede yeni bir adres girildiyse müşterinin listesine ekle (yeni
    // sipariş sayılmaz) ve siparişi o adrese bağla. Hata siparişi engellemez.
    try {
      customer.addressId = await recordCustomerAddress(customer, {
        countOrder: false,
        updateAddressId: input.updateSavedAddress
          ? input.customer.addressId
          : undefined,
      });
    } catch (e) {
      console.error("[updateOrderDetails] müşteri adresi kaydedilemedi", e);
    }

    // Ödeme: yöntem seçiliyse yaz. Yönteme ait olmayan alanları temizle ki
    // eski değerler takılı kalmasın (örn. nakitten karta geçince para üstü).
    const payment = buildPayment(input.payment);

    await OrderModel.findOneAndUpdate(
      { id },
      {
        items: input.items,
        customer,
        notes: input.notes ?? "",
        subtotal,
        total,
        ...(discount ? { discount } : { $unset: { discount: 1 } }),
        ...(payment ? { payment } : {}),
      },
    );

    revalidatePath("/orders");
    revalidatePath(`/orders/${id}`);
    // Düzenleme de gerçek zamanlı yayılsın (diğer sekme/cihazlar anlık görsün).
    await notifyOrdersChanged("order-edited");
  } catch (error) {
    console.error("[updateOrderDetails]", error);
    return { ok: false, error: "Sipariş güncellenemedi" };
  }

  // Detaya yönlendirmeyi sunucu yapar: revalidatePath'li action dönünce
  // Next mevcut sayfayı (düzenleme) yeniden yükler ve istemcideki
  // router.replace bunun altında kalıp ekranı düzenlemede bırakıyordu.
  // try dışında: redirect() hata fırlatarak çalışır, catch yutmasın.
  redirect(`/orders/${id}`, RedirectType.replace);
}

function buildPayment(p?: Partial<PaymentInfo>): PaymentInfo | null {
  if (!p?.method) return null;
  const out: PaymentInfo = { method: p.method };
  if (p.prepaid) out.prepaid = p.prepaid;
  if (p.method === "cash") {
    if (p.cashGiven != null) out.cashGiven = p.cashGiven;
    if (p.change != null) out.change = p.change;
  }
  if (p.method === "meal_card" && p.mealCardBrand) {
    out.mealCardBrand = p.mealCardBrand;
  }
  if (p.method === "iban") {
    if (p.ibanName) out.ibanName = p.ibanName;
    if (p.ibanNumber) out.ibanNumber = p.ibanNumber;
  }
  return out;
}
