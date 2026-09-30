import mongoose, { Schema } from "mongoose";

// Geri Kazan: müşteriye yapılan tek bir ulaşma (WhatsApp mesajı / telefon).
const WinbackContactSchema = new Schema(
  {
    id: { type: String, required: true },
    at: { type: Date, required: true },
    method: { type: String, enum: ["whatsapp", "call"], required: true },
    templateTitle: String,
    message: String,
    note: String,
    result: { type: String, enum: ["positive", "no_answer", "negative"] },
  },
  { _id: false },
);

// Telefon başına tek kayıt (key = phoneKey, son 10 hane). Müşterinin
// segmenti/sipariş özeti burada TUTULMAZ — her açılışta siparişlerden
// hesaplanır; burada yalnız bizim yaptıklarımız (ulaşma, erteleme, hariç) var.
const WinbackSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true },
    optOut: { type: Boolean, default: false }, // "mesaj istemiyor" — kalıcı hariç
    snoozeUntil: Date, // bu tarihe kadar listede gösterme
    contacts: { type: [WinbackContactSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Winback) {
  mongoose.deleteModel("Winback");
}

const WinbackModel = mongoose.models.Winback ?? mongoose.model("Winback", WinbackSchema);

export default WinbackModel;
