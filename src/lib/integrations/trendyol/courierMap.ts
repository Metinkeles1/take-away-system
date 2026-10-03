// Trendyol GO paketini kurye sayfasının `Order` şekline çevirir. Amaç: Trendyol
// siparişlerinin mevcut OrderCard + rota yardımcılarıyla AYNEN render edilmesi —
// kart, "Git", yakınlık-sıralı toplu rota hepsi tek kod yolundan geçsin.
//
// Bu objeler EPHEMERAL'dir (DB'ye yazılmaz). id `ty-<packageId>` ile damgalanır,
// externalRef = packageId (teslim çağrısı bununla yapılır). source = "trendyol"
// olduğundan kurye sayfası pin/ödeme düzenleme/claim'i bu kartlarda kapatır.

import type {
  MealCardBrand,
  Order,
  OrderItem,
  PaymentMethod,
  ProductCategory,
} from "@/types";
import type { TrendyolPackage } from "./client";

// Trendyol ödeme tipini panelin ödeme yöntemine eşler. Online ödenmiş (kart /
// yemek kartı online) siparişlerde kurye tahsilat YAPMAZ — rozet yine de doğru
// görünsün diye yöntem işaretlenir. Kapıda ödeme (PAY_WITH_ON_DELIVERY) tahsilatlıdır.
//
// GÜVENLİK NOTU: payment alanı beklenmedik/eksik gelirse (Trendyol API'sinden
// ender de olsa payment boş dönebilir) yöntemi "online" varsaymak TEHLİKELİ —
// kurye tahsilat yapmayı atlar ve işletme parayı kaybeder. Bu yüzden tanınmayan
// durumlarda "cash" varsayılır (kurye ekrandan elle düzeltebilir) ve terminale
// uyarı basılır ki gerçek veri görülüp eşleme netleştirilebilsin.
function mapTrendyolPayment(payment?: TrendyolPackage["payment"]): {
  method: PaymentMethod;
  mealCardBrand?: MealCardBrand;
} {
  if (!payment) {
    console.warn("[trendyol payment] payment alanı boş geldi — 'cash' varsayıldı.");
    return { method: "cash" };
  }

  const brandFromSource = (raw?: string): MealCardBrand | undefined => {
    const s = (raw ?? "").toUpperCase();
    if (s.includes("PLUXEE") || s.includes("SODEXO")) return "pluxee";
    if (s.includes("MULTINET")) return "multinet";
    if (s.includes("EDENRED")) return "edenred";
    if (s.includes("SETCARD")) return "setcard";
    if (s.includes("METROPOL")) return "metropol";
    if (s.includes("TOKENFLEX")) return "tokenflex";
    return undefined;
  };

  const paymentType = (payment.paymentType ?? "").toString().trim().toUpperCase();

  if (paymentType === "PAY_WITH_MEAL_CARD") {
    return {
      method: "meal_card",
      mealCardBrand: brandFromSource(payment.mealCard?.cardSourceType ?? undefined),
    };
  }
  if (paymentType === "PAY_WITH_ON_DELIVERY") {
    const t = (payment.onDelivery?.paymentType ?? "").toString().trim().toUpperCase();
    if (t === "CASH") return { method: "cash" };
    if (t === "CARD") return { method: "card" };
    if (t) {
      // Kapıda Pluxee/Multinet/Edenred/Setcard/Metropol/Tokenflex/Payekart/iWallet
      // kart veya kod ile ödeme → yemek kartı.
      return { method: "meal_card", mealCardBrand: brandFromSource(t) };
    }
    // onDelivery.paymentType boş geldi ama kapıda ödeme seçilmiş — tahsilat
    // gerektiği kesin, tür belirsiz. "cash" güvenli varsayım (kurye düzeltebilir).
    console.warn(
      "[trendyol payment] PAY_WITH_ON_DELIVERY ama onDelivery.paymentType boş — 'cash' varsayıldı.",
    );
    return { method: "cash" };
  }
  if (paymentType === "PAY_WITH_CARD") {
    // Online ödenmiş kart (kurye tahsilat yapmaz).
    return { method: "online" };
  }
  // Tanınmayan/boş paymentType — güvenli taraf: tahsilatlı say.
  console.warn(
    `[trendyol payment] tanınmayan paymentType="${payment.paymentType}" — 'cash' varsayıldı.`,
  );
  return { method: "cash" };
}

// Trendyol address1'i müşterinin haritada PİNLEDİĞİ noktadan üretir; elle
// yazdığı bina no ayrı alanda gelir (apartmentNumber) ve ikisi farklı olabilir
// (pin komşu binaya düşmüş: yazılan "Ahi Sk. 10", address1 "Ahi Sk. No:13").
// Kapıyı yazılan numara bulur → adres satırında o gösterilir, pinin farklı
// numarada olduğu detayda not edilir. Numara olmayan bina adı ("F2 blok")
// detaya eklenir. "0" boş sayılır.
// "12", "381B", "3/5" (bina/daire), "10-14" (bina aralığı).
const PLAIN_NO = /^\d+[a-zçğıöşü]?(?:[-/]\d+[a-zçğıöşü]?)?$/i;
// address1'deki kapı no ("No:14", "No:14/A", "No:3/5") — "Daire No: 25" kapı no değildir.
const MAP_NO = /(?<!daire\s*)\bNo\s*[:.]?\s*(\d+[a-zçğıöşü]?(?:\/(?:\d+[a-zçğıöşü]?|[a-zçğıöşü]))?)/i;

const lead = (s: string) => Number.parseInt(s, 10);
const hasLetter = (s: string) => /[a-zçğıöşü]/i.test(s);

// Yazılan bina no haritadaki numarayla aynı binayı mı gösteriyor? Numara
// eşitse ("118" ↔ "118D", "14/A" ↔ "14A") ya da yazılan aralık haritayı
// kapsıyorsa ("10-14" ↔ 13) evet.
function sameBuilding(apt: string, mapNo: string): boolean {
  if (lead(apt) === lead(mapNo)) return true;
  const range = apt.match(/^(\d+)-(\d+)$/);
  const n = lead(mapNo);
  return !!range && n >= Number(range[1]) && n <= Number(range[2]);
}

export function reconcileBuildingNo(
  mapLine: string,
  apartmentNumber?: string,
): { line: string; buildingNote: string | null } {
  // "no 5", "No:5", "118 D", "02" → "5", "5", "118D", "2"
  const apt = (apartmentNumber ?? "")
    .trim()
    .replace(/^no\s*[:.]?\s*/i, "")
    .replace(/^0+(?=\d)/, "")
    .replace(/^(\d+)\s+([a-zçğıöşü])$/i, "$1$2");
  if (!apt || /^0+$/.test(apt)) return { line: mapLine, buildingNote: null };

  if (!PLAIN_NO.test(apt)) {
    // Blok/site adı — adreste zaten geçiyorsa tekrar etme.
    const lower = (s: string) => s.toLocaleLowerCase("tr");
    return lower(mapLine).includes(lower(apt))
      ? { line: mapLine, buildingNote: null }
      : { line: mapLine, buildingNote: `Bina ${apt}` };
  }

  const m = mapLine.match(MAP_NO);
  if (m) {
    if (sameBuilding(apt, m[1])) {
      // Yazılan daha belirginse ("1" → "1B") satırda o görünsün.
      const line =
        hasLetter(apt) && !hasLetter(m[1]) ? mapLine.replace(MAP_NO, `No:${apt}`) : mapLine;
      return { line, buildingNote: null };
    }
    return {
      line: mapLine.replace(MAP_NO, `No:${apt}`),
      buildingNote: `Harita pini: No ${m[1]}`,
    };
  }
  // Haritadaki adreste numara yok — yazılan numara zaten geçmiyorsa ekle.
  // (PLAIN_NO'dan geçen değerde regex özel karakteri yok.)
  if (new RegExp(`(^|[^\\d])${apt}([^\\d]|$)`, "i").test(mapLine)) {
    return { line: mapLine, buildingNote: null };
  }
  return { line: mapLine ? `${mapLine} No:${apt}` : "", buildingNote: null };
}

export function mapTrendyolPackageToOrder(p: TrendyolPackage): Order {
  const a = p.address ?? {};

  const lat = a.latitude ? Number.parseFloat(a.latitude) : NaN;
  const lng = a.longitude ? Number.parseFloat(a.longitude) : NaN;
  const geo =
    Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

  const name =
    [a.firstName, a.lastName].filter(Boolean).join(" ").trim() ||
    [p.customer?.firstName, p.customer?.lastName].filter(Boolean).join(" ").trim() ||
    "Trendyol Müşteri";

  // Hero adres = address1 (+address2). address1 zaten "mahalle, cadde/sokak no"
  // içeriyor; başına neighborhood eklemek "Mevlana Mah Mevlana, ..." tekrarı
  // yaratıyordu. Boşsa mahalle / tarif fallback.
  const mapLine = [a.address1, a.address2]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  const { line, buildingNote } = reconcileBuildingNo(mapLine, a.apartmentNumber);
  const address =
    line || a.neighborhood?.trim() || a.addressDescription?.trim() || "Adres bilgisi yok";

  // Detay satırı: kat/daire (address1'de genelde yok) + adres tarifi. Tarif
  // address1'i birebir tekrar ediyorsa eklenmez (gürültüyü azalt).
  const building = [
    buildingNote,
    a.floor ? `Kat ${a.floor}` : null,
    a.doorNumber ? `Daire ${a.doorNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const norm = (s?: string) =>
    (s ?? "").toLocaleLowerCase("tr").replace(/[^0-9a-zçğıöşü]/gi, "");
  const desc = a.addressDescription?.trim();
  const descAdds = !!desc && norm(desc).length > 4 && !norm(line).includes(norm(desc));
  const addressDetail =
    [building || null, descAdds ? desc : null].filter(Boolean).join(" — ") ||
    undefined;

  // İlçe (+ il) — kartın alt satırında ve rota/harita adresinde görünür.
  const district =
    [a.district, a.city]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(", ") || undefined;

  const items: OrderItem[] = p.lines.map((l) => {
    const unit = l.unitSellingPrice ?? l.price ?? 0;
    const qty = l.items?.length || 1;
    return {
      product: {
        id: String(l.productId),
        name: l.name,
        price: unit,
        // Kurye kartında kategori gösterilmez; tip gereği geçerli bir değer veriyoruz.
        category: "kebap" as ProductCategory,
        available: true,
      },
      quantity: qty,
      totalPrice: unit * qty,
    };
  });

  const { method, mealCardBrand } = mapTrendyolPayment(p.payment);
  // Yemek kartı hem online (PAY_WITH_MEAL_CARD) hem kapıda (PAY_WITH_ON_DELIVERY)
  // olabildiği için "online mı" bilgisi yöntemden çıkarılamaz; ham tipten okunur.
  const payType = (p.payment?.paymentType ?? "").toString().trim().toUpperCase();
  const prepaid = payType === "PAY_WITH_CARD" || payType === "PAY_WITH_MEAL_CARD";
  const createdAt = new Date(p.packageCreationDate);

  // Kurye tahsilat tutarı: p.totalPrice indirimden ÖNCEKİ (brüt) tutardır —
  // promotions/coupon.totalSellerAmount = satıcının karşıladığı indirim kısmı,
  // bu formül trendyolDashboard.ts'teki hakediş hesabıyla AYNI ve Trendyol
  // Satışlar sayfasıyla doğrulanmıştır. Düşülmezse kurye kapıda müşteriden
  // indirimsiz (yüksek) tutar talep eder.
  const sellerDiscount =
    (p.promotions ?? []).reduce((s, pr) => s + (pr.totalSellerAmount ?? 0), 0) +
    (p.coupon?.totalSellerAmount ?? 0);
  const netTotal = Math.max((p.totalPrice ?? 0) - sellerDiscount, 0);

  // Trendyol paket statüsü → dahili Order.status. Shipped = kurye yola çıkmış
  // (henüz teslim değil) → "on-the-way" (kartta "Teslim" görünür). Picking/Invoiced
  // = henüz hazırlık/bekleme → "preparing" (kartta "Yola çıktım" adımı görünür).
  const status: Order["status"] =
    p.packageStatus === "Shipped" ? "on-the-way" : "preparing";

  return {
    id: `ty-${p.id}`,
    // orderNumber number tipinde (sıralama/uyumluluk için); insan-okur no orderCode'da.
    orderNumber: Number(p.orderNumber) || 0,
    orderCode: p.orderId || undefined,
    callPin: a.pinCode?.replace(/\D/g, "") || p.orderNumber || undefined,
    items,
    customer: {
      name,
      phone: a.phone ?? p.callCenterPhone ?? "",
      address,
      addressDetail,
      district,
      geo,
    },
    payment: { method, mealCardBrand, prepaid },
    status,
    notes: p.customerNote || undefined,
    subtotal: netTotal,
    deliveryFee: 0,
    total: netTotal,
    source: "trendyol",
    externalRef: p.id, // packageId — manual-delivered çağrısı bununla yapılır
    createdAt,
    updatedAt: createdAt,
  };
}
