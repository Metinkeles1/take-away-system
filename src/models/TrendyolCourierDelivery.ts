import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Kuryenin teslim ettiği Trendyol STORE paketlerinin KALICI kaydı.
//
// TrendyolCourierPackage bir cache'tir ve teslimde paket oradan silinir → "hangi
// kurye kaç Trendyol paketi attı" bilgisi kaybolurdu. Teslim anında buraya tek
// satır yazılır; Komuta Merkezi "Kurye Performansı" bunu okur. Tutar/hakediş
// hesabı buradan YAPILMAZ (kaynak settlement API) — yalnız kurye sayımı için.

const TrendyolCourierDeliverySchema = new Schema(
  {
    packageId: { type: String, required: true, unique: true, index: true },
    courier: { type: String, required: true },
    total: { type: Number, default: 0 },
    // Paketin Trendyol'da oluştuğu an — dönem filtresi kendi siparişlerle aynı
    // mantıkla (createdAt) çalışsın diye.
    orderCreatedAt: { type: Date, required: true, index: true },
    deliveredAt: { type: Date, required: true },
    deliveryDurationMin: { type: Number },
  },
  { timestamps: true, versionKey: false },
);

export type TrendyolCourierDeliveryDocument = InferSchemaType<
  typeof TrendyolCourierDeliverySchema
>;

const TrendyolCourierDeliveryModel =
  (mongoose.models.TrendyolCourierDelivery as mongoose.Model<TrendyolCourierDeliveryDocument>) ??
  mongoose.model<TrendyolCourierDeliveryDocument>(
    "TrendyolCourierDelivery",
    TrendyolCourierDeliverySchema,
  );

export default TrendyolCourierDeliveryModel;
