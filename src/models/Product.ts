import mongoose, { Schema } from "mongoose";

const ProductSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, required: true }, // Setting "menuCategories" içindeki value
    description: { type: String },
    available: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    image: { type: String }, // Blob URL veya /images/products/x.jpg yolu
    portionable: { type: Boolean, default: false }, // Porsiyon (½/1/1½) seçeneği sunulsun mu
    hiddenOptions: { type: [String], default: undefined }, // bu üründe gizlenen kategori seçenekleri (id)
  },
  { timestamps: true },
);

// Dev hot-reload'da eski şemalı model kalırsa yeni alan atılır — yeniden derle.
const cachedProduct = mongoose.models.Product as mongoose.Model<unknown> | undefined;
if (
  process.env.NODE_ENV !== "production" &&
  cachedProduct &&
  (!cachedProduct.schema.path("hiddenOptions") ||
    (cachedProduct.schema.path("category") as { enumValues?: string[] } | undefined)?.enumValues?.length)
) {
  mongoose.deleteModel("Product");
}

const ProductModel =
  mongoose.models.Product ?? mongoose.model("Product", ProductSchema);

export default ProductModel;
