import mongoose, { Schema } from "mongoose";

// Bir fiş üzerindeki tek tahsilat hareketi.
// delta pozitif → tahsilat (ödendi olarak yazıldı)
// delta negatif → geri alma (tahsilatın iptali / düzeltmesi)
// İlgili fişin paidAmount'u = ilgili payments.sum(delta) invariant'ı korur.
const PaymentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    voucherId: { type: String, required: true, index: true },
    corporateId: { type: String, required: true, index: true },
    delta: { type: Number, required: true },
    source: {
      type: String,
      enum: ["manual_toggle", "manual_edit", "collect", "period_paid"],
      required: true,
    },
    note: String,
  },
  { timestamps: true, versionKey: false },
);

PaymentSchema.index({ voucherId: 1, createdAt: -1 });
PaymentSchema.index({ corporateId: 1, createdAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Payment) {
  mongoose.deleteModel("Payment");
}

const PaymentModel =
  mongoose.models.Payment ?? mongoose.model("Payment", PaymentSchema);

export default PaymentModel;
