import mongoose, { Schema } from "mongoose";

const CorporateSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    phone: String,
    address: String,
    billingType: {
      type: String,
      enum: ["per_person", "per_item"],
      default: "per_person",
      required: true,
    },
    pricePerPerson: { type: Number, min: 0 },
    voucherCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false, strict: true },
);

// Dev modunda schema değişiminde stale model cache'i temizle
if (process.env.NODE_ENV !== "production" && mongoose.models.Corporate) {
  mongoose.deleteModel("Corporate");
}

const CorporateModel =
  mongoose.models.Corporate ?? mongoose.model("Corporate", CorporateSchema);

export default CorporateModel;
