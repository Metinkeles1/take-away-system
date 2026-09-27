import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";
import type { ContactAddress } from "@/lib/customers/contactFields";

// Google People API — müşterileri doğrudan Google Kişiler'e (telefon rehberi)
// yazar; CSV indir → contacts.google.com'a içe aktar adımının otomatiği.
//
// Bağlantı Ayarlar sayfasından kurulur: Client ID/Secret girilir, "Google ile
// Bağlan" → hangi hesapla izin verilirse kişiler o hesaba gider. Bilgiler
// Setting koleksiyonunda (key: googleContacts) durur; env yalnız yedek.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const API = "https://people.googleapis.com/v1";
// contacts: kişi okuma/yazma. email: bağlı hesabı Ayarlar'da gösterebilmek için.
const SCOPES = "https://www.googleapis.com/auth/contacts openid email";

export const SETTING_KEY = "googleContacts";
export const CALLBACK_PATH = "/api/google-contacts/callback";
// CSV'deki "Paket Servis" etiketiyle aynı — iki yoldan gelenler tek grupta.
export const CONTACT_GROUP_NAME = "Paket Servis";
// Google tek batchCreateContacts çağrısında en fazla 200 kişi kabul ediyor.
const BATCH_SIZE = 200;

export interface GoogleContactsSetting {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  email?: string;
  connectedAt?: Date;
  lastSync?: {
    at: Date;
    created: number;
    updated?: number;
    completed?: number;
    skipped: number;
    duplicates?: number;
    error?: string;
  };
}

export interface ContactData {
  name: string;
  phone: string; // E.164
  notes: string;
  addresses: ContactAddress[];
}

export async function readGoogleContactsSetting(): Promise<GoogleContactsSetting> {
  await connectDB();
  const doc = (await SettingModel.findOne({ key: SETTING_KEY }).lean()) as {
    value?: GoogleContactsSetting;
  } | null;
  const v = doc?.value ?? {};
  return {
    ...v,
    clientId: v.clientId || process.env.GOOGLE_CLIENT_ID,
    clientSecret: v.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: v.refreshToken || process.env.GOOGLE_CONTACTS_REFRESH_TOKEN,
  };
}

// Ayarın yalnız verilen alanlarını günceller (dot-path $set / $unset).
export async function patchGoogleContactsSetting(
  set: Partial<GoogleContactsSetting>,
  unset: (keyof GoogleContactsSetting)[] = [],
): Promise<void> {
  await connectDB();
  const $set = Object.fromEntries(
    Object.entries(set).map(([k, v]) => [`value.${k}`, v]),
  );
  const $unset = Object.fromEntries(unset.map((k) => [`value.${k}`, 1]));
  await SettingModel.updateOne(
    { key: SETTING_KEY },
    {
      ...(Object.keys($set).length ? { $set } : {}),
      ...(Object.keys($unset).length ? { $unset } : {}),
    },
    { upsert: true },
  );
}

export function buildAuthUrl(
  s: GoogleContactsSetting,
  redirectUri: string,
  state: string,
): string {
  return (
    AUTH_URL +
    "?" +
    new URLSearchParams({
      client_id: s.clientId!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent", // refresh token'ın her bağlanışta gelmesi için
      state,
    })
  );
}

// İzin sonrası gelen kodu refresh token'a çevirir + bağlanan hesabın e-postası.
export async function exchangeCode(
  s: GoogleContactsSetting,
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; email?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: s.clientId!,
      client_secret: s.clientSecret!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    refresh_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.refresh_token) {
    throw new Error(data.error_description ?? data.error ?? "Refresh token gelmedi");
  }
  // id_token doğrudan Google'dan TLS ile geldi; imza doğrulaması gerekmez,
  // sadece e-postayı okuyoruz.
  let email: string | undefined;
  if (data.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(data.id_token.split(".")[1], "base64url").toString("utf8"),
      ) as { email?: string };
      email = payload.email;
    } catch {
      /* e-posta gösterimi opsiyonel */
    }
  }
  return { refreshToken: data.refresh_token, email };
}

async function getAccessToken(s: GoogleContactsSetting): Promise<string> {
  if (!s.clientId || !s.clientSecret || !s.refreshToken) {
    throw new Error("Google Kişiler bağlı değil");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      refresh_token: s.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    // invalid_grant: izin geri alınmış / süresi dolmuş → Ayarlar'dan tekrar bağlan.
    throw new Error(
      data.error === "invalid_grant"
        ? "Google bağlantısı düşmüş — Ayarlar'dan tekrar bağlanın"
        : `Google token alınamadı: ${data.error ?? res.status}`,
    );
  }
  return data.access_token;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  // 429 (dakikalık kota) / 5xx (Google anlık sorun): kısa bekleyip 3 kez daha dener.
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 3) break;
    await pause(2000 * 2 ** attempt); // 2 sn, 4 sn, 8 sn
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`People API ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// CSV içe aktarımının otomatik açtığı etiketler ("2/4 tarihinde içe aktarıldı",
// "Imported on 4/2"). Bu projede rehbere CSV ile yalnız müşteri aktarıldığı
// için bu etiketlerdeki kişiler de bizim kayıtlarımız sayılır.
const IMPORT_LABEL = /içe aktarıldı|imported on/i;

// "Paket Servis" etiketi (yoksa oluşturur) + "bizim" sayılan CSV içe aktarım
// etiketleri. "Paket Servis" üyeliği tek başına "bizim kayıt" DEMEK DEĞİL:
// kişisel kayıtlar da müşteri oldukları için bu etikete toplanıyor.
async function ensureContactGroups(
  token: string,
): Promise<{ main: string; ours: Set<string> }> {
  const list = await api<{
    contactGroups?: {
      resourceName: string;
      name: string;
      formattedName?: string;
      groupType: string;
    }[];
  }>(token, "/contactGroups?pageSize=1000");
  const userGroups = (list.contactGroups ?? []).filter(
    (g) => g.groupType === "USER_CONTACT_GROUP",
  );
  const ours = new Set(
    userGroups
      .filter((g) => IMPORT_LABEL.test(g.name) || IMPORT_LABEL.test(g.formattedName ?? ""))
      .map((g) => g.resourceName),
  );
  let main = userGroups.find((g) => g.name === CONTACT_GROUP_NAME)?.resourceName;
  if (!main) {
    const created = await api<{ resourceName: string }>(token, "/contactGroups", {
      method: "POST",
      body: { contactGroup: { name: CONTACT_GROUP_NAME } },
    });
    main = created.resourceName;
  }
  return { main, ours };
}

interface GooglePerson {
  resourceName: string;
  etag: string;
  names?: { givenName?: string; familyName?: string; middleName?: string }[];
  phoneNumbers?: { value?: string; canonicalForm?: string }[];
  biographies?: { value?: string }[];
  addresses?: { streetAddress?: string; extendedAddress?: string }[];
  memberships?: { contactGroupMembership?: { contactGroupResourceName?: string } }[];
  clientData?: { key?: string; value?: string }[];
}

// Rehberdeki tüm kişiler (elle eklenmiş, CSV ile aktarılmış, bizim eklediğimiz).
async function listAllContacts(token: string): Promise<GooglePerson[]> {
  const out: GooglePerson[] = [];
  let pageToken: string | undefined;
  do {
    const page = await api<{ connections?: GooglePerson[]; nextPageToken?: string }>(
      token,
      "/people/me/connections?pageSize=1000" +
        "&personFields=names,phoneNumbers,biographies,addresses,memberships,clientData" +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""),
    );
    out.push(...(page.connections ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

// Bu uygulamanın oluşturduğu/yönettiği kişiye konan gizli işaret (clientData:
// yalnız bu OAuth uygulaması görür, rehberde görünmez). İşaretli kişi her
// Düzelt'te tamamen yeniden yazılır; işaretsiz (kişisel) kişide yalnız boş
// alanlar doldurulur — elle yazılmış isimler asla ezilmez.
const OWNER_KEY = "takeaway-system";
const OWNER_MARK = [{ key: OWNER_KEY, value: "1" }];

function isOwned(p: GooglePerson): boolean {
  return (p.clientData ?? []).some((d) => d.key === OWNER_KEY);
}

type Field = "names" | "biographies" | "addresses";
const ALL_FIELDS: Field[] = ["names", "biographies", "addresses"];

// Kişinin Google'a gidecek alanları (oluşturma ve güncellemede aynı).
function personFields(c: ContactData, only: Field[] = ALL_FIELDS) {
  const all = {
    names: [{ givenName: c.name }],
    biographies: c.notes ? [{ value: c.notes, contentType: "TEXT_PLAIN" }] : [],
    addresses: c.addresses.map((a, i) => ({
      type: i === 0 ? "home" : "other",
      streetAddress: a.street,
      ...(a.detail ? { extendedAddress: a.detail } : {}),
      formattedValue: a.detail ? `${a.street}, ${a.detail}` : a.street,
      country: "Türkiye",
    })),
  };
  return Object.fromEntries(only.map((f) => [f, all[f]]));
}

// İsimde hiç harf yoksa (numara, "??????????" gibi bozuk karakter) isim sayılmaz.
function displayName(p: GooglePerson): string {
  const n = p.names?.[0];
  return [n?.givenName, n?.middleName, n?.familyName].filter(Boolean).join(" ");
}

function hasRealName(p: GooglePerson): boolean {
  const full = displayName(p);
  return /\p{L}/u.test(full);
}

// Kişisel (etiketsiz) kayıtta YALNIZ boş olan alanlar — var olan asla ezilmez.
// Elle yazılmış "Seçkin Abi Kırgülü Sk 10/3" gibi isimler olduğu gibi kalır.
function missingFields(p: GooglePerson, c: ContactData): Field[] {
  const out: Field[] = [];
  if (!hasRealName(p)) out.push("names");
  if (c.notes && !p.biographies?.some((b) => b.value?.trim())) out.push("biographies");
  if (c.addresses.length && !p.addresses?.length) out.push("addresses");
  return out;
}

// Google'daki kişi zaten istediğimiz halde mi — gereksiz yazım yapılmasın.
function isUpToDate(p: GooglePerson, c: ContactData): boolean {
  const n = p.names?.[0];
  const nameOk =
    (n?.givenName ?? "") === c.name && !n?.familyName && !n?.middleName;
  const notesOk = (p.biographies?.[0]?.value ?? "") === c.notes;
  const have = (p.addresses ?? []).map(
    (a) => `${a.streetAddress ?? ""}|${a.extendedAddress ?? ""}`,
  );
  const want = c.addresses.map((a) => `${a.street}|${a.detail ?? ""}`);
  return nameOk && notesOk && have.join("\n") === want.join("\n");
}

export interface SyncStats {
  created: number; // rehberde yoktu, eklendi
  updated: number; // bizim etiketli kayıttı, güncel bilgiyle yeniden yazıldı
  completed: number; // kişisel kayıttı, yalnız eksik alanları (adres/not/isim) dolduruldu
  skipped: number; // kişisel kayıttı ve eksiği yoktu → dokunulmadı
  duplicates: number; // aynı numaralı ikinci/üçüncü "Paket Servis" kişisi
}

// Değişen her kişi — gönderim geçmişine (ContactSyncLog) yazılır.
export interface SyncItem {
  phone: string;
  name: string;
  action: "created" | "updated" | "completed";
  fields?: Field[];
}

// Rehberi müşteri listesine göre düzenler:
//  - Numarası rehberde olmayan → yeni kişi (Paket Servis etiketiyle).
//  - Numarası bizim kişide (uygulamanın işaretli kişisi ya da CSV "içe aktarıldı"
//    etiketli) olan → o kişi güncel isim /
//    adres / notla DÜZELTİLİR (eski CSV aktarımlarındaki numara-isimli, adressiz
//    kayıtlar böyle toparlanır). Aynı numaralı birden fazla kopya varsa yalnız
//    ilki düzeltilir; kopyalar Google'ın "Birleştir ve düzelt"iyle birleşir.
//  - Numarası etiketsiz (elle eklenmiş, kişisel) bir kişide olan → yalnız BOŞ
//    alanları doldurulur (adres yoksa adres, not yoksa not, isim numaraysa isim);
//    dolu alan asla ezilmez.
//  - Eşleşen her kişi "Paket Servis" etiketine alınır → müşteriler tek yerde.
// Google aynı kullanıcı için eşzamanlı yazımları sevmediğinden partiler sırayla.
export async function syncGoogleContacts(
  s: GoogleContactsSetting,
  contacts: ContactData[],
  normalize: (p: string) => string,
): Promise<SyncStats & { items: SyncItem[] }> {
  const items: SyncItem[] = [];
  const stats: SyncStats = {
    created: 0,
    updated: 0,
    completed: 0,
    skipped: 0,
    duplicates: 0,
  };
  if (contacts.length === 0) return { ...stats, items };
  const token = await getAccessToken(s);
  const { main: group, ours: ourGroups } = await ensureContactGroups(token);
  const existing = await listAllContacts(token);

  // numara → { bizim etiketli kişiler, etiketsiz (kişisel) kişiler }
  const byPhone = new Map<string, { ours: GooglePerson[]; foreign: GooglePerson[] }>();
  for (const p of existing) {
    const inGroup =
      isOwned(p) ||
      (p.memberships ?? []).some((m) =>
        ourGroups.has(m.contactGroupMembership?.contactGroupResourceName ?? ""),
      );
    const phones = new Set(
      (p.phoneNumbers ?? [])
        .map((n) => n.canonicalForm || normalize(n.value ?? ""))
        .filter(Boolean),
    );
    for (const ph of phones) {
      const e = byPhone.get(ph) ?? { ours: [], foreign: [] };
      (inGroup ? e.ours : e.foreign).push(p);
      byPhone.set(ph, e);
    }
  }

  const toCreate: ContactData[] = [];
  const toUpdate: {
    person: GooglePerson;
    data: ContactData;
    fields: Field[];
    kind: "updated" | "completed";
  }[] = [];
  const touched = new Set<string>(); // aynı kişi iki müşteriyle güncellenmesin
  for (const c of contacts) {
    const e = byPhone.get(c.phone);
    if (!e) {
      toCreate.push(c);
      continue;
    }
    const ours = e.ours.find((p) => !touched.has(p.resourceName));
    if (ours) {
      touched.add(ours.resourceName);
      stats.duplicates += e.ours.length - 1;
      if (!isUpToDate(ours, c)) {
        toUpdate.push({ person: ours, data: c, fields: ALL_FIELDS, kind: "updated" });
      }
      continue;
    }
    const personal = e.foreign.find((p) => !touched.has(p.resourceName));
    if (!personal) continue;
    touched.add(personal.resourceName);
    const fields = missingFields(personal, c);
    if (fields.length) toUpdate.push({ person: personal, data: c, fields, kind: "completed" });
    else stats.skipped++;
  }

  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    if (i > 0) await pause(1000);
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    await api(token, "/people:batchCreateContacts", {
      method: "POST",
      body: {
        readMask: "names",
        contacts: batch.map((c) => ({
          contactPerson: {
            ...personFields(c),
            phoneNumbers: [{ value: c.phone, type: "mobile" }],
            clientData: OWNER_MARK,
            // myContacts açıkça verilmezse kişi "Diğer kişiler"e düşebiliyor.
            memberships: [
              { contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts" } },
              { contactGroupMembership: { contactGroupResourceName: group } },
            ],
          },
        })),
      },
    });
    stats.created += batch.length;
    for (const c of batch) items.push({ phone: c.phone, name: c.name, action: "created" });
  }

  // Tek batchUpdate çağrısındaki kişiler aynı updateMask'i paylaşmalı →
  // güncellenecek alan kümesine göre gruplanır.
  const byMask = new Map<string, typeof toUpdate>();
  for (const u of toUpdate) {
    // Bizim kayıt yeniden yazılırken işaret de konur (CSV'den gelen eski
    // kayıtlar böylece bir sonraki turda etiket silinse de "bizim" kalır).
    const key = u.kind === "updated" ? [...u.fields, "clientData"].join(",") : u.fields.join(",");
    byMask.set(key, [...(byMask.get(key) ?? []), u]);
  }
  let wrote = toCreate.length > 0;
  for (const [mask, pending] of byMask) {
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      if (wrote) await pause(1000);
      wrote = true;
      const batch = pending.slice(i, i + BATCH_SIZE);
      await api(token, "/people:batchUpdateContacts", {
        method: "POST",
        body: {
          updateMask: mask,
          readMask: "names",
          contacts: Object.fromEntries(
            batch.map(({ person, data, fields }) => [
              person.resourceName,
              {
                etag: person.etag,
                ...personFields(data, fields),
                ...(mask.includes("clientData") ? { clientData: OWNER_MARK } : {}),
              },
            ]),
          ),
        },
      });
      for (const u of batch) {
        stats[u.kind]++;
        items.push({
          phone: u.data.phone,
          // Kişisel kayıtta isim değişmediyse rehberdeki mevcut isim gösterilir.
          name: u.fields.includes("names") ? u.data.name : displayName(u.person) || u.data.name,
          action: u.kind,
          ...(u.kind === "completed" ? { fields: u.fields } : {}),
        });
      }
    }
  }

  // Eski "içe aktarıldı" etiketinden eşleşenler de "Paket Servis"e alınsın —
  // tüm müşteriler rehberde tek etikette toplanır.
  const outsideMain = existing
    .filter((p) => touched.has(p.resourceName))
    .filter(
      (p) =>
        !(p.memberships ?? []).some(
          (m) => m.contactGroupMembership?.contactGroupResourceName === group,
        ),
    )
    .map((p) => p.resourceName);
  // Etiketleme süs niteliğinde: başarısız olursa kişiler zaten eklendi/düzeltildi,
  // senkron hata saymaz. Google yeni açılan ya da o an silinen etiketi kısa süre
  // "bulunamadı" (404) diyebiliyor → etiket listesi tazelenip bir kez daha denenir.
  if (outsideMain.length > 0) {
    const addToGroup = async (g: string) => {
      for (let i = 0; i < outsideMain.length; i += 1000) {
        await api(token, `/${g}/members:modify`, {
          method: "POST",
          body: { resourceNamesToAdd: outsideMain.slice(i, i + 1000) },
        });
      }
    };
    try {
      await addToGroup(group);
    } catch (err) {
      try {
        await pause(2000);
        await addToGroup((await ensureContactGroups(token)).main);
      } catch {
        console.warn("[googleContacts] Paket Servis etiketine eklenemedi:", err);
      }
    }
  }

  return { ...stats, items };
}
