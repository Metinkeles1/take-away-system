import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Kurye ekranındaki Trendyol STORE siparişlerinin PAYLAŞIMLI deposu.
//
// Amaç: bir kurye (veya bilgisayar) "Trendyol'u güncelle"ye basınca çekilen
// paketler buraya yazılır ve Pusher ile TÜM kurye ekranlarına yayılır — böylece
// herkes aynı canlı listeyi görür. Eskiden her ekran kendi çekiyordu (ephemeral
// local state), sipariş sadece çeken kuryede görünüyordu.
//
// Bu koleksiyon bir CACHE'tir: gerçek kaynak Trendyol API'sidir. Her sync aktif
// seti (Picking/Invoiced/Shipped, STORE) yeniden yazar, teslim/iptal olanları
// siler. TTL güvenlik ağıdır: sync uzun süre hiç yapılmazsa yetim kayıtlar
// STALE_HOURS sonra otomatik temizlenir (asıl temizlik sync'teki deleteMany).

const STALE_HOURS = 12;

const TrendyolCourierPackageSchema = new Schema(
  {
    // Trendyol packageId — order.externalRef ile aynı. Upsert anahtarı.
    packageId: { type: String, required: true, unique: true, index: true },
    // mapTrendyolPackageToOrder çıktısı (kurye kartı bununla render edilir).
    // Mixed: eşleme tek yerde (courierMap) kalsın; şema bunu kopyalamaz.
    order: { type: Schema.Types.Mixed, required: true },
    // Paketi üstlenen kurye (multi-kurye modu). Sync `order`'ı yeniden yazar ama
    // bu alana DOKUNMAZ → üstlenme sync'ten sonra da korunur. Boşsa havuzda.
    courier: { type: String },
    // Her sync'te tazelenir; TTL index buna bağlı.
    syncedAt: { type: Date, default: () => new Date(), required: true },
  },
  { timestamps: true, versionKey: false },
);

// TTL: sync durursa yetim kayıtlar STALE_HOURS sonra otomatik silinir.
TrendyolCourierPackageSchema.index(
  { syncedAt: 1 },
  { expireAfterSeconds: STALE_HOURS * 60 * 60 },
);

export type TrendyolCourierPackageDocument = InferSchemaType<
  typeof TrendyolCourierPackageSchema
>;

const TrendyolCourierPackageModel =
  (mongoose.models.TrendyolCourierPackage as mongoose.Model<TrendyolCourierPackageDocument>) ??
  mongoose.model<TrendyolCourierPackageDocument>(
    "TrendyolCourierPackage",
    TrendyolCourierPackageSchema,
  );

export default TrendyolCourierPackageModel;
