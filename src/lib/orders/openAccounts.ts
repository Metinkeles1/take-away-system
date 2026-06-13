import "server-only";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import type { CustomerOpenAccounts, OpenAccountRef } from "@/types";

// Verilen telefonlara ait açık hesapları (ödenmemiş siparişleri) TEK sorguda çeker
// ve telefon → özet (adet, toplam, sipariş listesi) eşlemesi döner. Kurye ve admin
// sipariş listelerinde "bu müşterinin açık hesabı var" uyarısı için kullanılır.
// Açık hesaplar koleksiyonda az olduğundan paymentStatus index'i sorguyu hafif tutar.
export async function getOpenAccountsByPhone(
  phones: string[],
): Promise<Map<string, CustomerOpenAccounts>> {
  const map = new Map<string, CustomerOpenAccounts>();
  const unique = [...new Set(phones.filter(Boolean))];
  if (unique.length === 0) return map;

  await connectDB();
  const docs = await OrderModel.find({
    paymentStatus: "open",
    status: { $ne: "cancelled" }, // iptal edilen sipariş alacak/uyarı sayılmaz
    "customer.phone": { $in: unique },
  })
    .select("id orderNumber total paidAmount customer.phone createdAt")
    .sort({ createdAt: -1 })
    .lean();

  for (const doc of docs) {
    const rec = doc as unknown as {
      id: string;
      orderNumber: number;
      total: number;
      paidAmount?: number;
      customer?: { phone?: string };
      createdAt: Date;
    };
    const phone = rec.customer?.phone;
    if (!phone) continue;
    // Alacak = sipariş tutarı − şimdiye dek tahsil edilen (kısmi ödeme düşülür).
    const remaining = Math.max(0, rec.total - (rec.paidAmount ?? 0));
    const ref: OpenAccountRef = {
      id: rec.id,
      orderNumber: rec.orderNumber,
      total: remaining,
      createdAt: rec.createdAt,
    };
    const cur = map.get(phone) ?? { count: 0, total: 0, orders: [] };
    cur.count += 1;
    cur.total += ref.total;
    cur.orders.push(ref);
    map.set(phone, cur);
  }
  return map;
}

// Özetten belirli bir siparişi çıkarır (uyarıyı gösteren siparişin KENDİSİ açık
// hesapsa, kendini saymamak için). Kalan açık hesap yoksa undefined döner →
// "başka açık hesap yok" anlamına gelir, uyarı gösterilmez.
export function openAccountsExcluding(
  summary: CustomerOpenAccounts | undefined,
  excludeId: string,
): CustomerOpenAccounts | undefined {
  if (!summary) return undefined;
  const orders = summary.orders.filter((o) => o.id !== excludeId);
  if (orders.length === 0) return undefined;
  return {
    count: orders.length,
    total: orders.reduce((s, o) => s + o.total, 0),
    orders,
  };
}
