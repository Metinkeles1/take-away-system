import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Kasadaki "Trendyol Yazıcı" programının iş kaydı — her yeni Trendyol paketi için
// bir satır. İki görevi var:
//   1) Otomatik kabul: aynı paket iki kez kabul edilmesin (packageId unique +
//      acceptLockAt ile atomik sahiplenme), hata olursa sınırlı tekrar.
//   2) Fiş kuyruğu: printQueuedAt dolu + printedAt boş = programın basacağı fiş.
// Deneme fişleri de buradan geçer (packageId "test-<cihaz>-<zaman>").
// Mutfak istasyonu fişleri de (kind "station", packageId "<sipariş>:st:<istasyon>"):
// panel / Trendyol / Yemeksepeti siparişinin o istasyona düşen ürünleri.
// Kayıtlar 7 gün sonra kendiliğinden silinir.

const TTL_DAYS = 7;

const TrendyolAutoJobSchema = new Schema(
  {
    packageId: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["order", "test", "station"], default: "order" },
    orderNumber: { type: String },
    accountName: { type: String },
    supplierId: { type: String },
    packageCreatedAt: { type: Date },

    // Kabul
    acceptAttempts: { type: Number, default: 0 },
    acceptLockAt: { type: Date },
    acceptOk: { type: Boolean },
    acceptedAt: { type: Date },
    acceptError: { type: String },

    // Fiş — receipt: programın çizeceği satırlar (bkz. lib/printAgent/receipt).
    receipt: { type: Schema.Types.Mixed },
    printQueuedAt: { type: Date },
    // Deneme fişi yalnız istenen bilgisayarda basılır; siparişte boş = herhangi biri.
    targetDevice: { type: String },
    // Doluysa program bu yazıcıya basar (istasyon fişi); boşsa bilgisayarın yazıcısı.
    printerName: { type: String },
    // Birden çok bilgisayar varsa fişi yalnız biri alır (kilit 60 sn).
    printLockAt: { type: Date },
    printLockBy: { type: String },
    printAttempts: { type: Number, default: 0 },
    printedAt: { type: Date },
    printedBy: { type: String },
    printError: { type: String },
  },
  { timestamps: true, versionKey: false },
);

TrendyolAutoJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: TTL_DAYS * 86_400 });
TrendyolAutoJobSchema.index({ printQueuedAt: 1, printedAt: 1 });

export type TrendyolAutoJobDocument = InferSchemaType<typeof TrendyolAutoJobSchema>;

// Dev hot-reload'da eski şemalı model kalırsa yeni alanlar atılır — yeniden derle.
const cachedJob = mongoose.models.TrendyolAutoJob as mongoose.Model<unknown> | undefined;
if (process.env.NODE_ENV !== "production" && cachedJob && !cachedJob.schema.path("printerName")) {
  mongoose.deleteModel("TrendyolAutoJob");
}

const TrendyolAutoJobModel =
  (mongoose.models.TrendyolAutoJob as mongoose.Model<TrendyolAutoJobDocument>) ??
  mongoose.model<TrendyolAutoJobDocument>("TrendyolAutoJob", TrendyolAutoJobSchema);

export default TrendyolAutoJobModel;
