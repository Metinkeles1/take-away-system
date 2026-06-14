import mongoose, { Schema } from "mongoose";

// Kurye — paneldeki "Ayarlar" sayfasından yönetilen basit kayıt. Login yok;
// kurye uygulamasında bu listeden adını seçer (cihazda saklanır). Pasif kuryeler
// listede çıkmaz ama geçmiş siparişlerdeki adları korunur (silmek yerine pasifle).
const CourierSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false, strict: true },
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Courier) {
  mongoose.deleteModel("Courier");
}

const CourierModel =
  mongoose.models.Courier ?? mongoose.model("Courier", CourierSchema);

export default CourierModel;
