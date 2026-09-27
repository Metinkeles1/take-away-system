import { connectDB } from "@/lib/mongodb";
import CustomerModel from "@/models/Customer";
import ContactSyncLogModel from "@/models/ContactSyncLog";
import { normalizeCustomerAddresses, pickDefaultAddress } from "@/lib/customers/addresses";
import {
  buildAddresses,
  buildFirstName,
  buildNotes,
  normalizePhone,
} from "@/lib/customers/contactFields";
import {
  patchGoogleContactsSetting,
  readGoogleContactsSetting,
  syncGoogleContacts,
  type ContactData,
  type SyncStats,
} from "@/lib/integrations/googleContacts";
import type { SavedCustomer } from "@/types";

export type ContactSyncResult =
  | ({ ok: true } & SyncStats)
  | { ok: false; reason: "not-configured" | "error"; error?: string };

function toSavedCustomer(doc: Record<string, unknown>): SavedCustomer {
  const { addresses, defaultAddressId } = normalizeCustomerAddresses(
    doc as Parameters<typeof normalizeCustomerAddresses>[0],
  );
  const def = pickDefaultAddress(addresses, defaultAddressId);
  return {
    id: doc.id as string,
    name: doc.name as string,
    phone: doc.phone as string,
    address: def?.address ?? (doc.address as string),
    addressDetail: def ? def.addressDetail : (doc.addressDetail as string | undefined),
    addresses,
    defaultAddressId,
    orderCount: doc.orderCount as number,
    updatedAt: doc.updatedAt as Date,
  };
}

// Müşteri listesini rehber kişisine çevirir; aynı numara bir kez.
function toContacts(docs: Record<string, unknown>[]): ContactData[] {
  const seen = new Set<string>();
  const out: ContactData[] = [];
  for (const doc of docs) {
    const c = toSavedCustomer(doc);
    const phone = normalizePhone(c.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({
      name: buildFirstName(c),
      phone,
      notes: buildNotes(c),
      addresses: buildAddresses(c),
    });
  }
  return out;
}

// Müşterileri Google Kişiler'e yazar (bkz. syncGoogleContacts): sistem tek
// doğru kaynak — rehberde olmayan eklenir, olan sistemdeki bilgiyle yeniden
// yazılır; müşteri olmayan numaralara dokunulmaz.
//
// mode "new": yalnız rehbere hiç aktarılmamış müşteriler (contactExportedAt
//   boş). Yeni müşteri kaydında ve gece cron'unda otomatik çalışan budur.
//   Eşzamanlı iki senkron aynı kişiyi iki kez göndermesin diye her müşteri
//   önce atomik olarak "sahiplenilir"; hata olursa işaret geri alınır.
// mode "all": tüm müşteriler — eksikleri ekler, farklı/bozuk kayıtları düzeltir.
export type SyncTrigger = "new-customer" | "cron" | "manual-new" | "manual-all";

export async function syncNewCustomersToGoogleContacts(
  mode: "new" | "all" = "new",
  trigger: SyncTrigger = "new-customer",
): Promise<ContactSyncResult> {
  const setting = await readGoogleContactsSetting();
  if (!setting.clientId || !setting.clientSecret || !setting.refreshToken) {
    return { ok: false, reason: "not-configured" };
  }

  await connectDB();
  const claimedAt = new Date();
  let docs: Record<string, unknown>[];
  const claimedIds: string[] = [];

  if (mode === "all") {
    docs = (await CustomerModel.find().sort({ createdAt: 1 }).lean()) as Record<
      string,
      unknown
    >[];
  } else {
    const pending = (await CustomerModel.find({ contactExportedAt: { $exists: false } })
      .sort({ createdAt: 1 })
      .lean()) as Record<string, unknown>[];
    docs = [];
    for (const doc of pending) {
      const claimed = await CustomerModel.updateOne(
        { id: doc.id, contactExportedAt: { $exists: false } },
        { $set: { contactExportedAt: claimedAt } },
        { timestamps: false },
      );
      if (claimed.modifiedCount === 0) continue; // başka senkron aldı
      claimedIds.push(doc.id as string);
      docs.push(doc);
    }
  }
  if (docs.length === 0) {
    return { ok: true, created: 0, updated: 0, skipped: 0, duplicates: 0 };
  }

  // Gönderim geçmişindeki satırı müşteri kaydına bağlamak için.
  const customerIdByPhone = new Map(
    docs.map((d) => [normalizePhone(d.phone as string), d.id as string]),
  );

  try {
    const { items, ...stats } = await syncGoogleContacts(
      setting,
      toContacts(docs),
      normalizePhone,
    );
    if (mode === "all") {
      await CustomerModel.updateMany(
        { id: { $in: docs.map((d) => d.id) }, contactExportedAt: { $exists: false } },
        { $set: { contactExportedAt: claimedAt } },
        { timestamps: false },
      );
    }
    await patchGoogleContactsSetting({ lastSync: { at: claimedAt, ...stats } });
    // Yalnız iş yapan turlar geçmişe yazılır ("yapacak iş yok" gürültü olur);
    // elle basılan butonlar sonuç ne olursa olsun yazılır.
    if (items.length > 0 || trigger.startsWith("manual")) {
      await writeLog({
        at: claimedAt,
        trigger,
        ok: true,
        durationMs: Date.now() - claimedAt.getTime(),
        ...stats,
        items: items.map((it) => ({
          ...it,
          customerId: customerIdByPhone.get(it.phone),
        })),
      });
    }
    return { ok: true, ...stats };
  } catch (err) {
    console.error("[googleContactsSync]", err);
    const error = err instanceof Error ? err.message : String(err);
    if (claimedIds.length > 0) {
      await CustomerModel.updateMany(
        { id: { $in: claimedIds }, contactExportedAt: claimedAt },
        { $unset: { contactExportedAt: 1 } },
        { timestamps: false },
      );
    }
    await patchGoogleContactsSetting({
      lastSync: { at: claimedAt, created: 0, updated: 0, skipped: 0, duplicates: 0, error },
    }).catch(() => {});
    await writeLog({
      at: claimedAt,
      trigger,
      ok: false,
      error,
      durationMs: Date.now() - claimedAt.getTime(),
    });
    return { ok: false, reason: "error", error };
  }
}

// Geçmiş yazımı senkronu asla bozmasın.
async function writeLog(entry: Record<string, unknown>): Promise<void> {
  try {
    await ContactSyncLogModel.create(entry);
  } catch (err) {
    console.error("[googleContactsSync] geçmiş yazılamadı", err);
  }
}
