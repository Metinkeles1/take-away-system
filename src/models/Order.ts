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
    // image bilinçli olarak yok: her siparişe kopyalanmasın. Sepet resmi
    // ürün id'si üzerinden canlı menüden okunur (CartList).
  },
  { _id: false },
);

// Satırın porsiyonu (0.5 / 1 / 1.5). Şemada yokken mongoose bu alanı sessizce
// atıyordu: aynı ürünün farklı porsiyonları kayıttan sonra ayırt edilemiyor,
// düzenlemede porsiyon fiyatı kayboluyordu.
const OrderItemPortionSchema = new Schema(
  {
    size: { type: String, enum: ["half", "full", "one_and_half"], required: true },
    label: { type: String, required: true },
    multiplier: { type: Number, required: true },
  },
  { _id: false },
);

const OrderItemSchema = new Schema(
  {
    product: { type: ProductSchema, required: true },
    quantity: { type: Number, required: true, min: 1 },
    portion: { type: OrderItemPortionSchema, default: undefined },
    options: { type: [String], default: undefined }, // "Soğansız", "Acısız"…
    note: String,
    totalPrice: { type: Number, required: true },
  },
  { _id: false },
);

const GeoPointSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: { type: Number }, // GPS doğruluk yarıçapı (metre); kötü pini ayırt etmek için
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
    addressId: String, // müşteri kaydındaki adres (Customer.addresses[].id)
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

// Açık hesaba yapılan tek bir kısmi tahsilat. Açık hesap parça parça ödenebilir.
const PaymentRecordSchema = new Schema(
  {
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ["cash", "card", "online", "meal_card", "iban"],
      required: true,
    },
    mealCardBrand: String,
    at: { type: Date, required: true },
    note: String,
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
    paidAt: Date, // açık hesabın tamamen tahsil edildiği an
    // Teslim metrikleri — sipariş İLK kez "delivered" olduğunda damgalanır.
    // deliveredAt: teslim anı. deliveryDurationMin: sipariş alındığından (createdAt)
    // teslim edildiğine kadar geçen TOPLAM süre (dakika). Şimdilik sadece kayıt
    // amaçlı; ileride teslim süresi analizleri bu alandan türetilir.
    deliveredAt: Date,
    deliveryDurationMin: Number,
    // Kısmi tahsilat geçmişi ve toplamı. Tamamı tahsil edilince paymentStatus "paid".
    payments: { type: [PaymentRecordSchema], default: undefined },
    paidAmount: { type: Number, default: 0 },
    // Siparişi teslim almak için üstlenen kurye adı. Kurye uygulamasında "Tüm
    // Paketler" listesinden check'lediğinde yazılır; boşsa havuzda (kimse almamış).
    courier: { type: String, default: undefined },
    // Kapıda alınan paranın (nakit/kart) kasaya teslim edildiği an ve teslim
    // kaydı (CashHandover.id). Boşsa para hâlâ kuryede sayılır.
    handedOverAt: Date,
    handoverId: String,
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

// Dev hot-reload'da eski şemalı model kalırsa yeni alanlar yine atılır —
// şemada items.portion / items.options yoksa eski model atılıp yeniden derlenir.
const cachedOrder = mongoose.models.Order as mongoose.Model<unknown> | undefined;
if (
  cachedOrder &&
  (!cachedOrder.schema.path("items.portion") || !cachedOrder.schema.path("items.options"))
) {
  mongoose.deleteModel("Order");
}

// Hot-reload sırasında model çoğalmasını önle
const OrderModel =
  (mongoose.models.Order as mongoose.Model<OrderDocument>) ??
  mongoose.model<OrderDocument>("Order", OrderSchema);

export default OrderModel;
