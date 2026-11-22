import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Eklentiden gelen ve henüz çözümlenmeyen (formatı bilinmeyen) yanıtların ham
// kopyası. Amaç: canlı sipariş formatını görüp çözümleyiciyi yazmak.
//
// KVKK: Müşteri adı/telefon/adres içerebilir → 3 gün sonra otomatik silinir
// (TTL). Kalıcı veri YemeksepetiOrder'dadır.

export const CAPTURE_TTL_SECONDS = 3 * 24 * 60 * 60;

const YemeksepetiCaptureSchema = new Schema(
  {
    kind: { type: String }, // fetch | xhr | ws
    url: { type: String, index: true },
    method: { type: String },
    status: { type: Number },
    body: { type: Schema.Types.Mixed },
    capturedAt: { type: Date },
    createdAt: { type: Date, default: () => new Date(), expires: CAPTURE_TTL_SECONDS },
  },
  { versionKey: false },
);

export type YemeksepetiCaptureDocument = InferSchemaType<typeof YemeksepetiCaptureSchema>;

if (process.env.NODE_ENV !== "production" && mongoose.models.YemeksepetiCapture) {
  mongoose.deleteModel("YemeksepetiCapture");
}

const YemeksepetiCaptureModel =
  (mongoose.models.YemeksepetiCapture as mongoose.Model<YemeksepetiCaptureDocument>) ??
  mongoose.model<YemeksepetiCaptureDocument>("YemeksepetiCapture", YemeksepetiCaptureSchema);

export default YemeksepetiCaptureModel;
