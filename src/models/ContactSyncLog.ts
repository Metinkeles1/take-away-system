import mongoose, { Schema } from "mongoose";

// Google Kişiler gönderim geçmişi — senkron çalışması başına tek kayıt.
// Ayarlar → Google Kişiler → "Gönderim Geçmişi"nden okunur: ne zaman, neyin
// tetiklediği, sonucu ve hangi müşterinin eklendiği/düzeltildiği.
//
// Yalnız iş yapan (eklenen/düzeltilen/hata) çalışmalar kaydedilir; "yapacak
// iş yok" turları gürültü olmasın diye yazılmaz. Satır listesinde yalnız
// değişen kişiler tutulur — dokunulmayanlar sadece sayı olarak durur.
// Kayıtlar LOG_RETENTION_DAYS sonra kendiliğinden silinir (TTL).

export const LOG_RETENTION_DAYS = 180;

const ItemSchema = new Schema(
  {
    customerId: String,
    name: String, // rehbere yazılan isim
    phone: String, // E.164
    // created: yeni kişi · updated: bizim kayıt yeniden yazıldı ·
    // completed: (eski sürüm) kişisel kayıtta yalnız boş alanlar dolduruldu
    action: { type: String, enum: ["created", "updated", "completed"] },
    // updated: üzerine yazılan eski rehber ismi — elle yazılmış isim kaybolmasın
    previousName: String,
    fields: { type: [String], default: undefined }, // completed: hangi alanlar
  },
  { _id: false },
);

const ContactSyncLogSchema = new Schema(
  {
    at: { type: Date, required: true },
    // new-customer: sipariş/yeni müşteri · cron: gece 23:59 · manual-*: Ayarlar butonları
    trigger: {
      type: String,
      enum: ["new-customer", "cron", "manual-new", "manual-all"],
      required: true,
    },
    ok: { type: Boolean, required: true },
    error: String,
    durationMs: Number,
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    items: { type: [ItemSchema], default: [] },
  },
  { versionKey: false },
);

ContactSyncLogSchema.index({ "items.phone": 1 });
// TTL index'i "en yeniler önce" sıralamasına da hizmet eder.
ContactSyncLogSchema.index(
  { at: 1 },
  { expireAfterSeconds: LOG_RETENTION_DAYS * 24 * 60 * 60 },
);

if (process.env.NODE_ENV !== "production" && mongoose.models.ContactSyncLog) {
  mongoose.deleteModel("ContactSyncLog");
}

const ContactSyncLogModel =
  mongoose.models.ContactSyncLog ??
  mongoose.model("ContactSyncLog", ContactSyncLogSchema);

export default ContactSyncLogModel;
