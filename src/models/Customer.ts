import mongoose, { Schema } from "mongoose";

const CustomerSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    address: { type: String, required: true },
    addressDetail: String,
    orderCount: { type: Number, default: 1 },
    // Kurye teslimatta yakaladığı kesin konum + hangi adres için yakalandığı.
    // geoAddress, adres değişince eski pini kullanmamak için eşleştirmede kullanılır.
    geo: {
      type: new Schema({ lat: Number, lng: Number, accuracy: Number }, { _id: false }),
      default: undefined,
    },
    geoAddress: String,
  },
  { timestamps: true },
);

const CustomerModel =
  mongoose.models.Customer ?? mongoose.model("Customer", CustomerSchema);

export default CustomerModel;
