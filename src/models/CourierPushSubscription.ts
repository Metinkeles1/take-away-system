import mongoose, { Schema } from "mongoose";

// Kurye telefonunun bildirim aboneliği (Web Push). Kurye uygulamasında
// "Bildirimleri aç" deyince tarayıcının verdiği abonelik buraya yazılır; panel
// "Kurye Çağır" ile bu kayıtlara bildirim gönderir. Kurye kimliği isim (kurye
// uygulamasında login yok, isim cihazda saklanır). Bir cihaz = bir kayıt
// (endpoint unique): cihaz başka kurye adına geçerse kayıt o kuryeye taşınır.
const CourierPushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true, index: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    courierName: { type: String, required: true, index: true },
    userAgent: { type: String },
  },
  { timestamps: true, versionKey: false, strict: true },
);

if (process.env.NODE_ENV !== "production" && mongoose.models.CourierPushSubscription) {
  mongoose.deleteModel("CourierPushSubscription");
}

const CourierPushSubscriptionModel =
  mongoose.models.CourierPushSubscription ??
  mongoose.model("CourierPushSubscription", CourierPushSubscriptionSchema);

export default CourierPushSubscriptionModel;
