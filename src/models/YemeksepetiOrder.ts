import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Yemeksepeti siparişleri — sipariş başına tek kayıt (orderId, ör. "oa7z-2647-ajlx").
//
// Kaynak: Yemeksepeti resmi API vermiyor. Kasadaki bilgisayarda partner paneli
// açıkken tarayıcı eklentisi (extensions/yemeksepeti) panelin kendi aldığı
// yanıtları POST /api/yemeksepeti/ingest'e iletir. Çözümleme sunucuda yapılır
// (src/lib/yemeksepeti/ingest.ts) → panel değişirse eklentiye dokunmadan
// burada düzeltilir.
//
// İki kaynak aynı kayda birleşir (orderId = canlıdaki externalId):
//  - Geçmiş (graphql): ürün+opsiyon, komisyon, net hakediş, durum zamanları.
//  - Canlı (vendor-api deliveries): müşteri adı/telefon/adres, ödeme, kısa kod,
//    kabul/çıkış zamanı. Müşteri bilgisi SADECE canlıdan gelir.

const OptionSchema = new Schema(
  { name: String, quantity: Number, unitPrice: Number },
  { _id: false },
);

const LineSchema = new Schema(
  {
    productId: { type: String },
    name: { type: String, default: "" },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    note: { type: String, default: "" },
    options: { type: [OptionSchema], default: undefined },
  },
  { _id: false },
);

const AddressSchema = new Schema(
  {
    street: String,
    building: String,
    buildingName: String,
    floor: String,
    entrance: String,
    area: String, // mahalle ("Safa İstanbul")
    info: String, // müşterinin adres tarifi
    lat: Number,
    lng: Number,
  },
  { _id: false },
);

const StatusSchema = new Schema(
  { status: String, at: Date },
  { _id: false },
);

const YemeksepetiOrderSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    vendorId: { type: String },
    status: { type: String, default: "", index: true }, // PICKED_UP, CANCELLED, ...
    deliveryType: { type: String }, // vendor_delivery | pickup | platform_delivery
    placedAt: { type: Date, index: true },

    // Tutarlar (TL). subtotal = sepet tutarı (indirim öncesi).
    subtotal: { type: Number, default: 0 },
    discountTotal: { type: Number }, // satıcı + platform indirim/kupon
    vendorDiscount: { type: Number }, // satıcının karşıladığı kupon/indirim
    commissionAmount: { type: Number },
    commissionRate: { type: Number },
    jokerFee: { type: Number },
    marketingFee: { type: Number },
    taxTotal: { type: Number },
    netRevenue: { type: Number }, // Yemeksepeti'nin tahmini net hakedişi
    billableStatus: { type: String },
    billingStatus: { type: String }, // NOT_PAID | PAID ...

    paymentType: { type: String }, // ONLINE | CASH
    paymentMethod: { type: String }, // YEMEKPAY_CREDITCARD, ...

    // Konum — geçmiş veride sadece posta kodu/şehir var.
    city: { type: String, default: "" },
    district: { type: String, default: "" },
    postCode: { type: String, default: "" },

    lines: { type: [LineSchema], default: [] },
    statuses: { type: [StatusSchema], default: undefined },

    // --- Canlı sipariş (vendor-api) ---
    liveId: { type: String }, // "oma_…"
    liveState: { type: String, index: true }, // NEW | ACCEPTED | CLOSED | CANCELLED ...
    shortCode: { type: String }, // paneldeki kısa no ("351")
    preorder: { type: Boolean },
    acceptedAt: { type: Date },
    promisedAt: { type: Date }, // müşteriye söz verilen teslim
    dispatchedAt: { type: Date }, // panelde "yola çıktı" işaretlendi
    customerId: { type: String },
    customerName: { type: String },
    customerPhone: { type: String },
    address: { type: AddressSchema, default: undefined },
    comment: { type: String }, // sipariş notu
    customerTotal: { type: Number }, // müşterinin ödediği (indirim sonrası)
    paymentLabel: { type: String }, // "Online Kredi/Banka Kartı"
    paid: { type: Boolean },
    provideChangeFor: { type: Number }, // nakitte para üstü
    liveLines: { type: [LineSchema], default: undefined }, // canlıdaki ürünler
    liveSeenAt: { type: Date }, // en son canlı yanıtın zamanı

    // --- Bizim kurye akışımız (Yemeksepeti'ye geri yazılmaz) ---
    courier: { type: String }, // üstlenen kurye; boşsa havuzda
    shippedAt: { type: Date }, // kurye "Yola çıktım" dedi
    deliveredAt: { type: Date, index: true }, // kurye "Teslim" dedi → kurye ekranından düşer
    deliveredBy: { type: String },
    deliveryDurationMin: { type: Number }, // placedAt → deliveredAt (dk)

    // --- Otomatik "yola çıktı" (eklenti Yemeksepeti'ye gönderir) ---
    // pending → eklenti alacak · sent → Yemeksepeti kabul etti · failed → hiçbir
    // içerik tutmadı (kasada elle basılmalı) · skipped → gönderilmedi
    dispatchStatus: { type: String, index: true },
    dispatchRequestedAt: { type: Date },
    dispatchLeaseAt: { type: Date }, // eklenti aldı (aynı anda iki sekme göndermesin)
    dispatchAttempts: { type: Number, default: 0 },
    dispatchVariant: { type: String }, // tutan içeriğin adı

    detailFetchedAt: { type: Date }, // detay (ürünler/fatura) en son ne zaman geldi
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, versionKey: false },
);

export type YemeksepetiOrderDocument = InferSchemaType<typeof YemeksepetiOrderSchema>;

if (process.env.NODE_ENV !== "production" && mongoose.models.YemeksepetiOrder) {
  mongoose.deleteModel("YemeksepetiOrder");
}

const YemeksepetiOrderModel =
  (mongoose.models.YemeksepetiOrder as mongoose.Model<YemeksepetiOrderDocument>) ??
  mongoose.model<YemeksepetiOrderDocument>("YemeksepetiOrder", YemeksepetiOrderSchema);

export default YemeksepetiOrderModel;
