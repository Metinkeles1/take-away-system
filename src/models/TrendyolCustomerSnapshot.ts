import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Trendyol paketlerinden çekilen müşteri bilgilerinin lokal snapshot'ı.
//
// Amaç: Trendyol yorumlarında sadece orderParentId döndüğü için, telafi/iletişim
// senaryosunda restoran "kim yorum yapmış" göremiyor. Reviews sayfası açıldığında
// son N gün paketleri buraya upsert edilir; sonra orderNumber üzerinden join yapılır.
//
// KVKK notu:
//  - TTL index ile `lastSeenAt`'ten 60 gün sonra otomatik silinir.
//  - lat/lng saklanmaz (telafi için gerekli değil).
//  - Müşteri silme talep ederse forgetCustomer() ile kayıt anında silinir.

const RETENTION_DAYS = 60;

const TrendyolCustomerSnapshotSchema = new Schema(
  {
    // Trendyol packages.orderNumber (string). Reviews API'sındaki orderParentId
    // ile string-eşleştirme yapılır.
    orderNumber: { type: String, required: true, unique: true, index: true },

    // Trendyol customer.id — aynı müşterinin farklı siparişlerini birleştirmek
    // için kullanılır. Telefon değişebilir, customerId stabil.
    customerId: { type: Number, index: true, sparse: true },

    customerName: { type: String, default: "" }, // firstName + lastName
    phone: { type: String, default: "" },         // address.phone veya callCenterPhone

    // Sipariş finansal/durum bilgisi — müşteri merkezli aggregation için.
    totalPrice: { type: Number, default: 0 },
    packageStatus: { type: String, default: "" }, // Created, Picking, Delivered, Cancelled, …

    // Zamanlama metrikleri — review detayında "kaç dakikada gitti / hazırlandı"
    // hesabı için. Tam durum-transition timestamp'i yok; lastModified-creation
    // farkı toplam süreyi verir.
    packageModificationDate: { type: Date },
    preparationTime: { type: Number, default: 0 }, // dakika cinsinden (restoranın söylediği)

    // Siparişin içeriği — review detayında "ne sipariş etti" göstermek için.
    // Hafif tutuyoruz: name + quantity + unitSellingPrice yeter.
    lines: {
      type: [
        {
          _id: false,
          productId: { type: Number },
          name: { type: String, default: "" },
          quantity: { type: Number, default: 1 },
          unitSellingPrice: { type: Number, default: 0 },
        },
      ],
      default: [],
    },

    // Adres alanları — KVKK gereği gereken alanlar dışı toplanmaz.
    addressFull: { type: String, default: "" }, // city + district + neighborhood + addressDescription birleşik
    district: { type: String, default: "" },
    city: { type: String, default: "" },
    neighborhood: { type: String, default: "" },
    addressDescription: { type: String, default: "" },

    // Trendyol metadata (debug + filtre için)
    packageCreationDate: { type: Date, index: true },
    storeId: { type: Number },
    deliveryType: { type: String }, // STORE / GO

    // Her sync'te güncellenir. TTL index buraya bağlı; en son görülen
    // siparişten 60 gün sonra döküman otomatik silinir.
    lastSeenAt: { type: Date, default: () => new Date(), required: true },
  },
  { timestamps: true, versionKey: false },
);

// TTL index: lastSeenAt'ten 60 gün sonra döküman otomatik silinir.
TrendyolCustomerSnapshotSchema.index(
  { lastSeenAt: 1 },
  { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 },
);

export type TrendyolCustomerSnapshotDocument = InferSchemaType<
  typeof TrendyolCustomerSnapshotSchema
>;

const TrendyolCustomerSnapshotModel =
  (mongoose.models.TrendyolCustomerSnapshot as mongoose.Model<TrendyolCustomerSnapshotDocument>) ??
  mongoose.model<TrendyolCustomerSnapshotDocument>(
    "TrendyolCustomerSnapshot",
    TrendyolCustomerSnapshotSchema,
  );

export default TrendyolCustomerSnapshotModel;
export { RETENTION_DAYS };
