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

const CustomerInfoSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    addressDetail: String,
    district: String,
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
  },
  {
    timestamps: true, // createdAt & updatedAt otomatik
    versionKey: false,
  },
);

export type OrderDocument = InferSchemaType<typeof OrderSchema>;

// Hot-reload sırasında model çoğalmasını önle
const OrderModel =
  (mongoose.models.Order as mongoose.Model<OrderDocument>) ??
  mongoose.model<OrderDocument>("Order", OrderSchema);

export default OrderModel;
