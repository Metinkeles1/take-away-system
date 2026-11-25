import mongoose, { Schema, type InferSchemaType } from "mongoose";

// "Trendyol Yazıcı" programının kurulu olduğu bilgisayarlar — her kurulum ilk
// açılışta kendine bir kimlik (deviceId) üretir ve her yoklamada kendini bildirir.
// Fiş yazdırma, yazıcı seçimi, deneme fişi ve uzaktan kaldırma bilgisayar
// başınadır; otomatik kabul genel ayardır (Setting "printAgent").
const PrintAgentDeviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    host: { type: String, default: "" }, // Windows bilgisayar adı
    version: { type: String, default: "" },
    printers: { type: [String], default: [] },
    printerName: { type: String, default: "" }, // "" = program kendisi seçer
    print: { type: Boolean, default: true },
    lastSeenAt: { type: Date },
    testRequestedAt: { type: Date },
    // Dolu → bilgisayar bir sonraki yoklamada kendini kaldırır, kayıt silinir.
    uninstallRequestedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

export type PrintAgentDeviceDocument = InferSchemaType<typeof PrintAgentDeviceSchema>;

const PrintAgentDeviceModel =
  (mongoose.models.PrintAgentDevice as mongoose.Model<PrintAgentDeviceDocument>) ??
  mongoose.model<PrintAgentDeviceDocument>("PrintAgentDevice", PrintAgentDeviceSchema);

export default PrintAgentDeviceModel;
