import mongoose, { Schema } from "mongoose";

const CustomerSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    address: { type: String, required: true },
    addressDetail: String,
    orderCount: { type: Number, default: 1 },
    // Kurye teslimatta yakaladığı kesin konum. Telefon eşleşmesiyle sonraki
    // siparişlere taşınır — ANCAK yalnızca geoAddress de eşleşirse (aşağı bkz).
    geo: {
      type: new Schema({ lat: Number, lng: Number, accuracy: Number }, { _id: false }),
      default: undefined,
    },
    // Pinin yakalandığı adresin normalize anahtarı (addrKey). Sonraki siparişe pin
    // ancak adres bununla eşleşirse iliştirilir; müşteri farklı adrese sipariş
    // verince eski pin yanlışlıkla taşınmaz.
    geoAddress: String,
  },
  { timestamps: true },
);

const CustomerModel =
  mongoose.models.Customer ?? mongoose.model("Customer", CustomerSchema);

export default CustomerModel;
