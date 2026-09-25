import mongoose, { Schema } from "mongoose";

const GeoSchema = new Schema(
  { lat: Number, lng: Number, accuracy: Number },
  { _id: false },
);

// Müşterinin adreslerinden biri. Pin (geo) adrese aittir.
const AddressSchema = new Schema(
  {
    id: { type: String, required: true },
    address: { type: String, required: true },
    addressDetail: String,
    district: String,
    geo: { type: GeoSchema, default: undefined },
    useCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// address/addressDetail/geo (üst seviye): VARSAYILAN adresin kopyası — eski
// okuyucular ve eski kayıtlarla uyum için tutulur. Asıl kaynak `addresses`.
// `addresses` boş olan eski kayıtlar okunurken üst seviyeden tek adres
// türetilir (bkz. lib/customers/addresses.ts → normalizeCustomerAddresses).
const CustomerSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    address: { type: String, required: true },
    addressDetail: String,
    orderCount: { type: Number, default: 1 },
    // (eski uyum) Varsayılan adresin pini. Asıl pin adres başına:
    // addresses[].geo — aynı numaranın başka adresine yanlış pin taşınmasın.
    geo: { type: GeoSchema, default: undefined },
    // (eski) Pinin yakalandığı adres metni — artık eşleştirmede kullanılmıyor,
    // eski kayıtlarla uyum için tutuluyor.
    geoAddress: String,
    addresses: { type: [AddressSchema], default: undefined },
    defaultAddressId: String,
  },
  { timestamps: true },
);

const CustomerModel =
  mongoose.models.Customer ?? mongoose.model("Customer", CustomerSchema);

export default CustomerModel;
