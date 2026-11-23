import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Otomatik "yola çıktı" (Yemeksepeti'ye geri yazma) kayıtları — Ayarlar'daki
// Yemeksepeti Köprüsü kartında listelenir; kullanıcı kopyalayıp geliştiriciye iletir.
//
// kind:
//   queued   → kurye "Yola çıktım" dedi, eklentinin göndermesi bekleniyor
//   attempt  → eklenti bir içerik denedi (ok: başarılı mı)
//   learned  → kasada elle "yola çıktı"ya basıldı; panelin GERÇEK gönderdiği içerik
//   skipped  → gönderilmedi (kapalı, süre aşımı, zaten yola çıkmış…)
//
// GİZLİLİK: Giriş anahtarı (Authorization vb.) ASLA yazılmaz — sadece başlık
// ADLARI. Yanıttan yalnız durum alanları alınır (müşteri bilgisi yazılmaz).
// 14 gün sonra kendiliğinden silinir.

const TTL_SECONDS = 14 * 24 * 60 * 60;

const YemeksepetiDispatchLogSchema = new Schema(
  {
    kind: { type: String, required: true }, // queued | attempt | learned | skipped
    orderId: { type: String, index: true }, // "oa7z-2648-loqm"
    liveId: { type: String }, // "oma_…"
    shortCode: { type: String },
    ok: { type: Boolean },
    method: { type: String },
    url: { type: String }, // sorgu kısmı atılmış adres
    requestBody: { type: String }, // gönderilen / öğrenilen içerik (≤ 2 KB)
    httpStatus: { type: Number },
    responseState: { type: String }, // yanıttaki "state"
    responseInfo: { type: String }, // hata mesajı vb. (≤ 500 karakter, PII'siz)
    headerNames: { type: [String], default: undefined }, // eklentinin eklediği başlık ADLARI
    note: { type: String },
    createdAt: { type: Date, default: () => new Date(), expires: TTL_SECONDS },
  },
  { versionKey: false },
);

export type YemeksepetiDispatchLogDocument = InferSchemaType<typeof YemeksepetiDispatchLogSchema>;

if (process.env.NODE_ENV !== "production" && mongoose.models.YemeksepetiDispatchLog) {
  mongoose.deleteModel("YemeksepetiDispatchLog");
}

const YemeksepetiDispatchLogModel =
  (mongoose.models.YemeksepetiDispatchLog as mongoose.Model<YemeksepetiDispatchLogDocument>) ??
  mongoose.model<YemeksepetiDispatchLogDocument>(
    "YemeksepetiDispatchLog",
    YemeksepetiDispatchLogSchema,
  );

export default YemeksepetiDispatchLogModel;
