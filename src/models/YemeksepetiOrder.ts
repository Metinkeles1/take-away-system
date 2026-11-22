import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Yemeksepeti siparişleri — sipariş başına tek kayıt (orderId, ör. "oa7z-2647-ajlx").
//
// Kaynak: Yemeksepeti resmi API vermiyor. Kasadaki bilgisayarda partner paneli
// açıkken tarayıcı eklentisi (extensions/yemeksepeti) panelin kendi aldığı
// yanıtları POST /api/yemeksepeti/ingest'e iletir. Çözümleme sunucuda yapılır
// (src/lib/yemeksepeti/ingest.ts) → panel değişirse eklentiye dokunmadan
// burada düzeltilir.
//
// Geçmiş sipariş verisinde (graphql) müşteri adı/telefon/adres YOK; bunlar
// canlı sipariş akışından (deliveries-web) gelecek. O format henüz bilinmediği
// için canlı yanıtlar şimdilik YemeksepetiCapture'a ham kaydedilir.

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
