import mongoose, { Schema } from "mongoose";

const VoucherItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    portionLabel: String,
    note: String,
  },
  { _id: false },
);

const VoucherSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    voucherNumber: { type: Number, required: true, unique: true, index: true },
    corporateId: { type: String, required: true, index: true },
    corporateName: { type: String, required: true },
    billingType: {
      type: String,
      enum: ["per_person", "per_item"],
      required: true,
      default: "per_person",
    },
    date: { type: Date, required: true, index: true },
    // per_person
    personCount: { type: Number, min: 1 },
    pricePerPerson: { type: Number, min: 0 },
    // per_item
    items: { type: [VoucherItemSchema], default: undefined },
    // ortak
    total: { type: Number, required: true, min: 0 },
    note: String,
    paid: { type: Boolean, default: false, index: true },
    paidAt: Date,
    paidAmount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

// Compound indexler — sık kullanılan sorgu pattern'larını kapsar:
// 1) getVouchersByCorporate + getPeriodStats: { corporateId, date in range } sıralı date desc
// 2) getCorporatesWithBalance: { paid:false } grouped by corporateId — index'ten direkt çekebilir
VoucherSchema.index({ corporateId: 1, date: -1 });
VoucherSchema.index({ paid: 1, corporateId: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Voucher) {
  mongoose.deleteModel("Voucher");
}

const VoucherModel =
  mongoose.models.Voucher ?? mongoose.model("Voucher", VoucherSchema);

export default VoucherModel;
