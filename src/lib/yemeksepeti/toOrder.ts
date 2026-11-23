// YemeksepetiOrder kaydını panelin/kurye ekranının `Order` şekline çevirir.
// Amaç Trendyol'daki courierMap ile aynı: Yemeksepeti siparişi de mevcut kart,
// rota ve geçmiş listesi koduyla AYNEN çizilsin.
//
// id = `ys-<orderId>`, externalRef = orderId ("oa7z-2648-loqm") — kurye
// işlemleri (üstlen/teslim) bununla yapılır. source = "yemeksepeti".
//
// Önemli: Yemeksepeti'ye geri yazma YOK. "Yola çıktım"/"Teslim" yalnızca bizim
// kaydımıza işlenir; Yemeksepeti panelindeki durumu kasadaki kişi yönetir.

import type { Order, OrderItem, PaymentMethod, ProductCategory } from "@/types";
import { floorLabel } from "@/lib/integrations/trendyol/address";

type Line = {
  productId?: string | null;
  name?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  note?: string | null;
  options?: { name?: string | null; quantity?: number | null; unitPrice?: number | null }[] | null;
};

// .lean() ile okunan kaydın kullandığımız alanları.
export type YsOrderDoc = {
  orderId: string;
  status?: string | null;
  liveState?: string | null;
  shortCode?: string | null;
  placedAt?: Date | null;
  updatedAt?: Date | null;
  subtotal?: number | null;
  discountTotal?: number | null;
  customerTotal?: number | null;
  paymentType?: string | null;
  paymentLabel?: string | null;
  paid?: boolean | null;
  customerName?: string | null;
  customerPhone?: string | null;
  city?: string | null;
  district?: string | null;
  address?: {
    street?: string | null;
    building?: string | null;
    buildingName?: string | null;
    floor?: string | null;
    entrance?: string | null;
    area?: string | null;
    info?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  comment?: string | null;
  lines?: Line[] | null;
  liveLines?: Line[] | null;
  dispatchedAt?: Date | null;
  courier?: string | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  deliveryDurationMin?: number | null;
};

// Kurye ekranında/panelde görünecek kayıtlar için gereken alanlar.
export const YS_ORDER_FIELDS = {
  orderId: 1,
  status: 1,
  liveState: 1,
  shortCode: 1,
  placedAt: 1,
  updatedAt: 1,
  subtotal: 1,
  discountTotal: 1,
  customerTotal: 1,
  paymentType: 1,
  paymentLabel: 1,
  paid: 1,
  customerName: 1,
  customerPhone: 1,
  city: 1,
  district: 1,
  address: 1,
  comment: 1,
  lines: 1,
  liveLines: 1,
  dispatchedAt: 1,
  courier: 1,
  shippedAt: 1,
  deliveredAt: 1,
  deliveryDurationMin: 1,
} as const;

const CANCELLED = /CANCEL|REJECT|EXPIRED/i;

export function isYsCancelled(d: Pick<YsOrderDoc, "liveState" | "status">): boolean {
  return CANCELLED.test(d.liveState ?? "") || CANCELLED.test(d.status ?? "");
}

function mapStatus(d: YsOrderDoc): Order["status"] {
  if (isYsCancelled(d)) return "cancelled";
  if (d.deliveredAt) return "delivered";
  // Canlı kaydı olmayan (yalnız geçmişten gelen) sipariş: Yemeksepeti'de bitmiş.
  if (!d.liveState) return d.status === "PICKED_UP" || d.status === "DELIVERED" ? "delivered" : "preparing";
  // Kurye bizde "Yola çıktım" dedi ya da kasada Yemeksepeti panelinden
  // "yola çıktı" işaretlendi (CLOSED + dispatchedAt) → yolda, "Teslim" açık.
  if (d.shippedAt || d.dispatchedAt) return "on-the-way";
  if (d.liveState === "NEW") return "pending";
  return "preparing";
}

// Ödeme: ONLINE → ödenmiş (kurye tahsilat yapmaz). Diğer her şey (nakit, kapıda
// kart, bilinmeyen) GÜVENLİ taraf: kapıda tahsilat — kurye para almayı atlamasın.
function mapPayment(d: YsOrderDoc): Order["payment"] {
  const type = (d.paymentType ?? "").toUpperCase();
  const label = (d.paymentLabel ?? "").toLocaleLowerCase("tr");
  if (type === "ONLINE" || d.paid === true) return { method: "online", prepaid: true };
  let method: PaymentMethod = "cash";
  if (/kart|card/.test(label)) method = /yemek|meal|multinet|sodexo|pluxee|edenred|setcard|ticket/.test(label) ? "meal_card" : "card";
  return { method, prepaid: false };
}

function mapItems(d: YsOrderDoc): OrderItem[] {
  // Geçmiş detayı (opsiyonlu) varsa o, yoksa canlıdaki ürünler.
  const src = d.lines?.length ? d.lines : (d.liveLines ?? []);
  return src.map((l, i) => {
    const unit = l.unitPrice ?? 0;
    const qty = l.quantity ?? 1;
    const opts = (l.options ?? []).map((o) => o.name?.trim()).filter((s): s is string => !!s);
    const note = l.note?.trim();
    return {
      product: {
        id: `ys-${l.productId ?? i}`,
        name: l.name ?? "",
        price: unit,
        category: "kebap" as ProductCategory,
        available: true,
      },
      quantity: qty,
      totalPrice: unit * qty,
      ...(opts.length ? { options: opts } : {}),
      ...(note ? { note } : {}),
    };
  });
}

function mapAddress(d: YsOrderDoc): Pick<Order["customer"], "address" | "addressDetail" | "district" | "geo"> {
  const a = d.address ?? {};
  const street = a.street?.trim() ?? "";
  const building = a.building?.trim() ?? "";
  const line =
    [street, building ? `No:${building}` : "", a.buildingName?.trim() ?? ""].filter(Boolean).join(" ") ||
    a.info?.trim() ||
    "Adres bilgisi yok";

  const norm = (s?: string | null) => (s ?? "").toLocaleLowerCase("tr").replace(/[^0-9a-zçğıöşü]/gi, "");
  const info = a.info?.trim();
  // Tarif adres satırını aynen tekrar ediyorsa ya da çok kısaysa ("3") ekleme.
  const infoAdds = !!info && norm(info).length > 3 && !norm(line).includes(norm(info));
  const addressDetail =
    [floorLabel(a.floor), a.entrance?.trim() ? `Daire ${a.entrance.trim()}` : null, infoAdds ? info : null]
      .filter(Boolean)
      .join(" · ") || undefined;

  // "Safa İstanbul" → "Safa" (şehir adı mahallenin sonuna yapışık geliyor).
  const city = d.city?.trim() ?? "";
  const area = (a.area ?? "").trim().replace(new RegExp(`\\s*${city}$`, "i"), "").trim();
  const district = [area, d.district?.trim()].filter(Boolean).join(", ") || undefined;

  const geo =
    typeof a.lat === "number" && typeof a.lng === "number" && a.lat !== 0 ? { lat: a.lat, lng: a.lng } : undefined;
  return { address: line, addressDetail, district, geo };
}

// Panel notu: Yemeksepeti ödeme adını nota ekliyor ("…\n Online Kredi/Banka Kartı") —
// ödeme rozette zaten görünüyor, tekrarı at.
function cleanComment(d: YsOrderDoc): string | undefined {
  let c = (d.comment ?? "").trim();
  if (d.paymentLabel) c = c.replace(d.paymentLabel, "").trim();
  return c || undefined;
}

export function ysDocToOrder(d: YsOrderDoc): Order {
  const placed = d.placedAt ? new Date(d.placedAt) : new Date(0);
  const subtotal = d.subtotal ?? 0;
  const total = d.customerTotal ?? Math.max(subtotal - (d.discountTotal ?? 0), 0);
  return {
    id: `ys-${d.orderId}`,
    orderNumber: Number(d.shortCode) || 0,
    // Kartta paneldeki kısa no görünsün (#351); yoksa sipariş kodunun sonu.
    orderCode: d.shortCode || d.orderId.split("-").pop() || d.orderId,
    items: mapItems(d),
    customer: {
      name: d.customerName?.trim() || "Yemeksepeti müşterisi",
      phone: d.customerPhone ?? "",
      ...mapAddress(d),
    },
    payment: mapPayment(d),
    status: mapStatus(d),
    notes: cleanComment(d),
    subtotal: total,
    deliveryFee: 0,
    total,
    source: "yemeksepeti",
    externalRef: d.orderId,
    courier: d.courier ?? undefined,
    ...(d.deliveredAt ? { deliveredAt: new Date(d.deliveredAt) } : {}),
    ...(d.deliveryDurationMin != null ? { deliveryDurationMin: d.deliveryDurationMin } : {}),
    createdAt: placed,
    updatedAt: d.updatedAt ? new Date(d.updatedAt) : placed,
  };
}
