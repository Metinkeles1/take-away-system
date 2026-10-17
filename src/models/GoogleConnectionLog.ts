import mongoose, { Schema } from "mongoose";

// Google Kişiler bağlantı olayları — kopmaların sebebini sonradan incelemek için.
//  connected:    "Google ile Bağlan" tamamlandı
//  disconnected: Ayarlar'dan elle "Bağlantıyı kes"
//  dropped:      Google token'ı reddetti (invalid_grant); bağlantı başına bir kez
// dropped kaydındaki connectedAt / hoursConnected: o bağlantı ne kadar yaşadı.
// ~168 saat (7 gün) çıkıyorsa OAuth uygulaması "Testing" modunda demektir.

const GoogleConnectionLogSchema = new Schema(
  {
    at: { type: Date, required: true },
    event: {
      type: String,
      enum: ["connected", "disconnected", "dropped"],
      required: true,
    },
    email: String,
    connectedAt: Date,
    hoursConnected: Number,
    error: String, // dropped: Google'ın döndüğü hata (error + error_description)
  },
  { versionKey: false },
);

GoogleConnectionLogSchema.index({ at: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.GoogleConnectionLog) {
  mongoose.deleteModel("GoogleConnectionLog");
}

const GoogleConnectionLogModel =
  mongoose.models.GoogleConnectionLog ??
  mongoose.model("GoogleConnectionLog", GoogleConnectionLogSchema);

export default GoogleConnectionLogModel;
