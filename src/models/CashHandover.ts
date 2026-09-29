import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Kuryenin kapıda aldığı parayı (nakit + kapıda kart) kasaya teslim ettiği an.
// Panelde "Teslim aldım"a basılınca bir kayıt oluşur; kapsadığı siparişler
// (yerel Order + Trendyol arşivi) handoverId ile bu kayda bağlanır.
// expected* = sistemin hesapladığı, countedCash = elle sayılan (girildiyse).
const CashHandoverSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    courier: { type: String, required: true, index: true },
    expectedCash: { type: Number, default: 0 },
    expectedCard: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    countedCash: { type: Number }, // girilmediyse beklenenle aynı kabul edilir
    cashDiff: { type: Number, default: 0 }, // counted − expected (eksik < 0)
    note: { type: String },
    at: { type: Date, required: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

export type CashHandoverDocument = InferSchemaType<typeof CashHandoverSchema>;

if (process.env.NODE_ENV !== "production" && mongoose.models.CashHandover) {
  mongoose.deleteModel("CashHandover");
}

const CashHandoverModel =
  (mongoose.models.CashHandover as mongoose.Model<CashHandoverDocument>) ??
  mongoose.model<CashHandoverDocument>("CashHandover", CashHandoverSchema);

export default CashHandoverModel;
