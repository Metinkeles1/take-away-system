import mongoose, { Schema } from "mongoose";

// Basit anahtar-değer ayar deposu. Tek dokümanlık global ayarlar burada tutulur
// (örn. çoklu kurye modu). İleride başka ayarlar da aynı koleksiyona eklenebilir.
const SettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed },
  },
  { timestamps: true, versionKey: false, strict: true },
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Setting) {
  mongoose.deleteModel("Setting");
}

const SettingModel =
  mongoose.models.Setting ?? mongoose.model("Setting", SettingSchema);

export default SettingModel;
