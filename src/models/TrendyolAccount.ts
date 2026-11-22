import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Trendyol GO Yemek satıcı hesapları — Ayarlar > Trendyol Hesapları'ndan yönetilir.
// Her işletmenin kendi Satıcı ID'si + API anahtarı/şifresi vardır; bir hesabın
// altında birden çok mağaza (şube) olabilir. Panel tüm aktif hesapları birlikte
// gösterir (sipariş = hesabın supplierId'si ile etiketlenir).
//
// API anahtarı/şifresi şifreli saklanır (bkz. lib/crypto/secretBox); istemciye
// hiçbir zaman açık metin dönmez.
const TrendyolAccountSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }, // panelde görünen işletme adı
    supplierId: { type: String, required: true, unique: true, trim: true },
    apiKeyEnc: { type: String, required: true },
    apiSecretEnc: { type: String, required: true },
    // Mağaza (şube) ID'leri — boşsa son siparişlerden bulunur. "Bağlantıyı test et"
    // otomatik doldurur.
    storeIds: { type: [Number], default: [] },
    active: { type: Boolean, default: true },
    // Rozet rengi (panelde siparişin hangi işletmeye ait olduğunu ayırmak için).
    color: { type: String, default: "orange" },
    lastTestAt: { type: Date },
    lastTestOk: { type: Boolean },
    lastTestError: { type: String },
  },
  { timestamps: true, versionKey: false },
);

export type TrendyolAccountDoc = InferSchemaType<typeof TrendyolAccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

if (process.env.NODE_ENV !== "production" && mongoose.models.TrendyolAccount) {
  mongoose.deleteModel("TrendyolAccount");
}

const TrendyolAccountModel =
  mongoose.models.TrendyolAccount ??
  mongoose.model("TrendyolAccount", TrendyolAccountSchema);

export default TrendyolAccountModel;
