import mongoose, { Schema } from "mongoose";

const CustomerSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    address: { type: String, required: true },
    addressDetail: String,
    orderCount: { type: Number, default: 1 },
  },
  { timestamps: true },
);

const CustomerModel =
  mongoose.models.Customer ?? mongoose.model("Customer", CustomerSchema);

export default CustomerModel;
