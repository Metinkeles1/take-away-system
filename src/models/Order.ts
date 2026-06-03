import mongoose, { Schema, type InferSchemaType } from "mongoose";

// ─── Alt Şemalar ─────────────────────────────────────────────────────────────

const ProductSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, required: true },
    description: String,
    portion: {
      type: Number,
      enum: [0.5, 1, 1.5, 2],
      default: 1,
      required: true,
    },
    available: { type: Boolean, default: true },
  },
  { _id: false },
);

const OrderItemSchema = new Schema(
  {
    product: { type: ProductSchema, required: true },
    quantity: { type: Number, required: true, min: 1 },
    note: String,
    totalPrice: { type: Number, required: true },
  },
  { _id: false },
);

const GeoPointSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const CustomerInfoSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    addressDetail: String,
    district: String,
    geo: { type: GeoPointSchema, default: undefined }, // teslimatta yakalanan konum
  },
  { _id: false },
);

const PaymentInfoSchema = new Schema(
  {
    method: {
      type: String,
      enum: ["cash", "card", "online", "meal_card", "iban"],
      required: true,
    },
    cashGiven: Number,
    change: Number,
    mealCardBrand: String, // sadece yemek kartı markası kaydedilir
  },
  { _id: false },
);

// ─── Ana Sipariş Şeması ───────────────────────────────────────────────────────

const OrderSchema = new Schema(
  {
    // Zustand'daki string id'yi koruyoruz (UI routing için)
    id: { type: String, required: true, unique: true, index: true },
    orderNumber: { type: Number, required: true },
    items: { type: [OrderItemSchema], required: true },
    customer: { type: CustomerInfoSchema, required: true },
    payment: { type: PaymentInfoSchema, required: true },
    status: {
      type: String,
      enum: ["pending", "preparing", "on-the-way", "delivered", "cancelled"],
      default: "pending",
    },
    notes: String,
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    total: { type: Number, required: true },
    source: {
      type: String,
      enum: ["manual", "trendyol", "getir", "yemeksepeti"],
      default: "manual",
    },
    externalRef: { type: String, index: true, sparse: true },
    // Tahsilat durumu — "open" açık hesap, "paid" ödendi. Eski kayıtlar varsayılan "paid".
    paymentStatus: {
      type: String,
      enum: ["paid", "open"],
      default: "paid",
      index: true,
    },
    paidAt: Date, // açık hesabın tahsil edildiği an
  },
  {
    timestamps: true, // createdAt & updatedAt otomatik
    versionKey: false,
  },
);

// Trendyol watcher'ın sık çalıştırdığı sorgular için compound index.
// `find({ source, createdAt > X }).sort({ createdAt: -1 })` collection scan'den kurtulur.
OrderSchema.index({ source: 1, createdAt: -1 });

// Siparişler listesi penceresi (getOrders) için. Sort daima createdAt -1; aktif
// statü dalı status'a dayanır. $or'un her dalı indexli olmazsa tüm sorgu tam
// taramaya düşer. status index'i ayrıca getActiveOrdersCount'u da hızlandırır.
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1 });

export type OrderDocument = InferSchemaType<typeof OrderSchema>;

// Hot-reload sırasında model çoğalmasını önle
const OrderModel =
  (mongoose.models.Order as mongoose.Model<OrderDocument>) ??
  mongoose.model<OrderDocument>("Order", OrderSchema);

export default OrderModel;
