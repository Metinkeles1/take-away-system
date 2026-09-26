import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Trendyol siparişlerinin KALICI arşivi — sipariş başına tek kayıt (orderNumber).
//
// Neden: Trendyol API'si geçmişe sınırlı gider ve her rapor canlı çekmek zorunda
// kalır. Arşiv sayesinde müşteri geçmişi (devamlı müşteri, soğuyan/kayıp),
// bölge, kurye, teslim süresi ve sipariş bazlı hakediş kalıcı tutulur.
//
// Önemli: Bu koleksiyon ciro/hakediş TOPLAMLARININ kaynağı DEĞİLDİR — Komuta
// Genel Bakış ve Gün Sonu parasal rakamları Trendyol API'sinden okumaya devam
// eder (çifte sayım olmasın). Arşiv; müşteri, operasyon ve sipariş detayı içindir.
//
// Beslenme (bkz. src/lib/trendyol/archive.ts):
//  - Rapor/sayfa açılınca "tazelik kontrolü" (son 2 gün, rate-gated)
//  - Gün sonu cron'u (son günler + settlement → hakediş)
//  - Kurye ekranı (sync / yola çıktı / teslim → kurye + süre)
//  - Elle "Geçmişi yükle" (15 günlük parçalar)
//
// KVKK: Kayıt kalıcıdır; ad, adres, konum satış/bölge analizi için saklanır
// (işletme içi, üçüncü kişiyle paylaşılmaz). Telefon PII_RETENTION_DAYS sonra
// silinir (piiPurgedAt). Silme talebinde anonymizeTrendyolOrders tüm kişisel
// alanları temizler.
//
// Koleksiyon adı eski TrendyolCustomerSnapshot ile aynıdır: mevcut kayıtlar
// (son 60 gün) arşivin başlangıcı olur. Eski TTL index'i ilk senkronda düşürülür.

export const PII_RETENTION_DAYS = 60;

const LineSchema = new Schema(
  {
    productId: { type: Number },
    name: { type: String, default: "" },
    quantity: { type: Number, default: 1 },
    unitSellingPrice: { type: Number, default: 0 },
  },
  { _id: false },
);

// Tek bir settlement kaydının siparişe düşen payı (işaretli). settlementLines
// map'inde settlement id ile tutulur → aynı kayıt tekrar gelse de idempotent.
const SettlementLineSchema = new Schema(
  {
    type: { type: String },
    seller: { type: Number, default: 0 }, // işaretli sellerRevenue
    commission: { type: Number, default: 0 }, // mutlak komisyon
    at: { type: Date },
  },
  { _id: false },
);

const TrendyolOrderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    packageId: { type: String, index: true, sparse: true },
    storeId: { type: Number },
    deliveryType: { type: String }, // STORE (bizim kurye) / GO (Trendyol kuryesi)
    packageStatus: { type: String, default: "", index: true },

    // Müşteri — customerId stabil grup anahtarı (telefon maskeli/proxy olabilir).
    customerId: { type: Number, index: true, sparse: true },
    customerName: { type: String, default: "" },
    phone: { type: String, default: "" }, // süre sonunda silinir

    // Adres — bölge/harita analizi için kalıcı.
    city: { type: String, default: "" },
    district: { type: String, default: "" },
    neighborhood: { type: String, default: "" },
    street: { type: String, default: "" }, // address1 + address2 (cadde/sokak/no)
    floor: { type: String, default: "" },
    doorNumber: { type: String, default: "" },
    apartmentNumber: { type: String, default: "" },
    addressDescription: { type: String, default: "" }, // müşterinin adres tarifi
    addressFull: { type: String, default: "" },
    lat: { type: Number },
    lng: { type: Number },

    // İçerik + tutar
    lines: { type: [LineSchema], default: [] },
    totalPrice: { type: Number, default: 0 }, // brüt (indirim öncesi)
    sellerDiscount: { type: Number, default: 0 }, // satıcının karşıladığı promosyon+kupon
    netTotal: { type: Number, default: 0 }, // müşterinin ödediği (brüt − satıcı indirimi)
    paymentKey: { type: String }, // online | card | cash | meal_card
    mealCardBrand: { type: String },

    // Zaman
    packageCreationDate: { type: Date, index: true },
    packageModificationDate: { type: Date },
    preparationTime: { type: Number, default: 0 }, // dk (restoranın söylediği)
    shippedAt: { type: Date }, // bizim kurye "yola çıktım"
    deliveredAt: { type: Date }, // bizim kurye teslim anı; yoksa Trendyol son değişiklik
    deliveryDurationMin: { type: Number }, // createdAt → teslim (toplam süre)
    deliveryTimeSource: { type: String, enum: ["courier", "trendyol"] },

    // Kurye (yalnız STORE paketleri, kurye ekranından)
    courier: { type: String, index: true, sparse: true },

    // Hakediş — settlement kayıtları geldikçe dolar. netRevenue = settlementLines
    // toplamı (gerçek). Settlement'a hiç düşmeyen (yemek kartı vb.) siparişte boş
    // kalır; okurken tahmini hakediş kullanılır.
    settlementLines: { type: Map, of: SettlementLineSchema, default: undefined },
    netRevenue: { type: Number },
    commissionAmount: { type: Number },

    // Arşiv meta
    lastSeenAt: { type: Date, default: () => new Date() }, // son senkron (TTL YOK)
    piiPurgedAt: { type: Date },
    anonymizedAt: { type: Date }, // silme talebi — senkron kişisel veriyi geri yazmaz
  },
  { timestamps: true, versionKey: false },
);

TrendyolOrderSchema.index({ customerId: 1, packageCreationDate: -1 });
TrendyolOrderSchema.index({ courier: 1, packageCreationDate: -1 });

export type TrendyolOrderDocument = InferSchemaType<typeof TrendyolOrderSchema>;

// Dev'de hot-reload eski şemalı modeli tutar → yeni alanlar (strict) sessizce
// atılır. Setting modelindeki gibi dev'de modeli yeniden kur.
if (process.env.NODE_ENV !== "production" && mongoose.models.TrendyolOrder) {
  mongoose.deleteModel("TrendyolOrder");
}

const TrendyolOrderModel =
  (mongoose.models.TrendyolOrder as mongoose.Model<TrendyolOrderDocument>) ??
  mongoose.model<TrendyolOrderDocument>(
    "TrendyolOrder",
    TrendyolOrderSchema,
    "trendyolcustomersnapshots",
  );

export default TrendyolOrderModel;
