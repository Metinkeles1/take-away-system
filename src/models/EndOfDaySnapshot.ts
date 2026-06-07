import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Gün sonu raporunun dondurulmuş kaydı (snapshot).
//
// Amaç: getEndOfDayReport() her çağrıda Order + Voucher'dan ANLIK hesaplar.
// O yüzden geçmiş bir gün, sonradan yapılan değişikliklerden (iptal, ödeme,
// düzeltme) etkilenir — "günün resmî cirosu" diye sabit bir kayıt yoktu.
//
// Bu model o günün özetini dondurur:
//  - Cron (00:30 IST) bir önceki günü otomatik kapatır.
//  - Sayfadaki "Günü Kapat" butonu elle kapatır (kapalı günü uyarıyla yeniden yazar).
//  - Dış proje (adisyon) /api/gun-sonu üzerinden buradan okur.
//
// report alanı EndOfDayReport'un tamamını (tüm kırılımlar dahil) gömer; rapor
// şekli değişse bile şema kırılmaz. totalRevenue/packageCount kök seviyede de
// tutulur ki dış API/listeleme tek dökümandan ucuza filtreleyebilsin.

const EndOfDaySnapshotSchema = new Schema(
  {
    // Istanbul gününün ISO tarihi "YYYY-MM-DD" — tekil anahtar.
    date: { type: String, required: true, unique: true, index: true },

    // EndOfDayReport'un tamamı (ödeme/kanal/kurumsal kırılımları dahil).
    report: { type: Schema.Types.Mixed, required: true },

    // Hızlı erişim için kök seviyede özet (report.* ile aynı değer).
    totalRevenue: { type: Number, default: 0 },
    packageCount: { type: Number, default: 0 },

    // Ne zaman ve nasıl donduruldu.
    closedAt: { type: Date, default: () => new Date() },
    source: { type: String, enum: ["cron", "manual"], default: "manual" },

    // Elle girilen kasa sayımı (gün kapatılırken kaydedilir). Sistem hesabıyla
    // OTOMATİK kıyaslanmaz; sadece o günün fiziki kasa toplamı olarak saklanır.
    // Cron kapanışında dokunulmaz (undefined geçilir → eski değer korunur).
    cashCounted: { type: Number, default: null }, // nakit kasa toplamı (₺)
    cardCounted: { type: Number, default: null }, // kredi kartı (POS) toplamı (₺)
    ibanCounted: { type: Number, default: null }, // IBAN / havale toplamı (₺)
    ticketCounted: { type: Number, default: null }, // yemek kartı (ticket) toplamı (₺)
  },
  { timestamps: true, versionKey: false },
);

export type EndOfDaySnapshotDocument = InferSchemaType<typeof EndOfDaySnapshotSchema>;

const EndOfDaySnapshotModel =
  (mongoose.models.EndOfDaySnapshot as mongoose.Model<EndOfDaySnapshotDocument>) ??
  mongoose.model<EndOfDaySnapshotDocument>("EndOfDaySnapshot", EndOfDaySnapshotSchema);

export default EndOfDaySnapshotModel;
