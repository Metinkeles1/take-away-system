import mongoose, { Schema } from "mongoose";

const ProductSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: {
      type: String,
      required: true,
      enum: ["kebap", "pide", "lahmacun", "durum", "kilo", "corba", "tatli", "icecek"],
    },
    description: { type: String },
    available: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    image: { type: String }, // Blob URL veya /images/products/x.jpg yolu
    portionable: { type: Boolean, default: false }, // Porsiyon (½/1/1½) seçeneği sunulsun mu
  },
  { timestamps: true },
);

const ProductModel =
  mongoose.models.Product ?? mongoose.model("Product", ProductSchema);

export default ProductModel;
